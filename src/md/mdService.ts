import * as vscode from 'vscode';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthService } from '../auth/authService';
import type { LabelService } from '../label/labelService';
import { SessionRejectedError, isSessionRejectedMessage } from '../auth/sessionRejection';
import { MD_CACHE_KEY } from './constants';
import type { MdListPayload, MdRecord } from './types';
import { MdNetworkError, MdValidationError, assertWithinSizeLimit, decodeUtf8Strict, isBinaryContent, suggestFilenameFromPath } from './validation';

interface MdRow {
  id: string;
  title: string;
  filename: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface MdCacheEntry {
  userId: string;
  records: MdRecord[];
}

function toRecord(row: MdRow, labelIds: string[] = []): MdRecord {
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    labelIds,
  };
}

/** Node/undiciのfetch失敗がどう表面化するかは環境依存のため、実装時にログで実際の文言を確認して調整すること。 */
function isNetworkErrorMessage(message: string): boolean {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|network|Failed to fetch/i.test(message);
}

function toServiceError(message: string): Error {
  // 到達できたがトークンを拒否された場合は、ネットワーク障害でも入力ミスでもなく
  // 再認証が必要な状態なので、呼び出し側が区別できるよう専用のエラーにする。
  if (isSessionRejectedMessage(message)) {
    return new SessionRejectedError(message);
  }
  return isNetworkErrorMessage(message) ? new MdNetworkError(message) : new Error(message);
}

export class MdService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly supabase: SupabaseClient,
    private readonly authService: AuthService,
    private readonly labelService: LabelService,
  ) {}

  async list(options?: { labelIds?: string[] }): Promise<MdListPayload> {
    const filterLabelIds = options?.labelIds ?? [];
    const filtering = filterLabelIds.length > 0;

    let filterMdIds: string[] | undefined;
    if (filtering) {
      filterMdIds = await this.labelService.listMdIdsForLabelIds(filterLabelIds);
      if (filterMdIds.length === 0) {
        return { records: [], source: 'live', offline: false };
      }
    }

    let query = this.supabase
      .from('md')
      .select('id,title,filename,content,created_at,updated_at')
      .is('deleted_at', null);
    if (filterMdIds) {
      query = query.in('id', filterMdIds);
    }
    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      // 絞り込み中はキャッシュ(全件のみ保持)にフォールバックすると結果が過剰になるため、そのまま失敗させる。
      if (isNetworkErrorMessage(error.message) && !filtering) {
        return { records: this.readCache(), source: 'cache', offline: true };
      }
      throw toServiceError(error.message);
    }

    const rows = data as MdRow[];
    const labelMap = await this.labelService.listLabelIdsForMdIds(rows.map((row) => row.id));
    const records = rows.map((row) => toRecord(row, labelMap.get(row.id) ?? []));
    if (!filtering) {
      await this.writeCache(records);
    }
    return { records, source: 'live', offline: false };
  }

  /** ロードは単体のmdを対象にするため、一覧を取らずに1件だけ引く。 */
  async get(id: string): Promise<MdRecord> {
    const { data, error } = await this.supabase
      .from('md')
      .select('id,title,filename,content,created_at,updated_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      // ロードはローカルへの書き出しなので、オフラインでもキャッシュ済みなら実行できるようにする。
      if (isNetworkErrorMessage(error.message)) {
        const cached = this.readCache().find((record) => record.id === id);
        if (cached) {
          return cached;
        }
      }
      throw toServiceError(error.message);
    }
    if (!data) {
      throw new MdValidationError('対象のmdが見つかりません');
    }

    const labelMap = await this.labelService.listLabelIdsForMdIds([id]);
    return toRecord(data as MdRow, labelMap.get(id) ?? []);
  }

  async create(input: { title: string; filename: string; content: string }): Promise<MdRecord> {
    assertWithinSizeLimit(Buffer.byteLength(input.content, 'utf8'));
    const { data, error } = await this.supabase.from('md').insert(input).select().single();
    if (error || !data) {
      throw toServiceError(error?.message ?? 'mdの作成に失敗しました');
    }
    return toRecord(data as MdRow);
  }

  async update(
    id: string,
    patch: Partial<{ title: string; filename: string; content: string }>,
  ): Promise<MdRecord> {
    if (patch.content !== undefined) {
      assertWithinSizeLimit(Buffer.byteLength(patch.content, 'utf8'));
    }
    const { data, error } = await this.supabase.from('md').update(patch).eq('id', id).select().single();
    if (error || !data) {
      throw toServiceError(error?.message ?? 'mdの更新に失敗しました');
    }
    const labelMap = await this.labelService.listLabelIdsForMdIds([id]);
    return toRecord(data as MdRow, labelMap.get(id) ?? []);
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.supabase.from('md').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      throw toServiceError(error.message);
    }
  }

  async importFromFile(uri: vscode.Uri): Promise<MdRecord> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (isBinaryContent(bytes)) {
      throw new MdValidationError('バイナリファイルはインポートできません');
    }
    assertWithinSizeLimit(bytes.byteLength);
    const content = decodeUtf8Strict(bytes);
    const filename = suggestFilenameFromPath(uri.fsPath);
    return this.create({ title: filename, filename, content });
  }

  private currentUserId(): string | undefined {
    return this.authService.getState().user?.id;
  }

  private readCache(): MdRecord[] {
    const userId = this.currentUserId();
    if (!userId) {
      return [];
    }
    const cache = this.context.globalState.get<MdCacheEntry>(MD_CACHE_KEY);
    if (!cache || cache.userId !== userId) {
      return [];
    }
    // labelIds導入前に書かれたキャッシュにはこのフィールドが無いため補完する。
    return cache.records.map((record) => ({ ...record, labelIds: record.labelIds ?? [] }));
  }

  private async writeCache(records: MdRecord[]): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) {
      return;
    }
    const entry: MdCacheEntry = { userId, records };
    await this.context.globalState.update(MD_CACHE_KEY, entry);
  }
}

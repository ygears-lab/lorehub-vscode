import * as vscode from 'vscode';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthService } from '../auth/authService';
import { LABEL_CACHE_KEY } from './constants';
import type { LabelRecord } from './types';
import { LabelNetworkError, LabelValidationError, assertNonBlankName } from './validation';

interface LabelRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface LabelCacheEntry {
  userId: string;
  labels: LabelRecord[];
}

const UNIQUE_VIOLATION = '23505';

function toRecord(row: LabelRow): LabelRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Node/undiciのfetch失敗がどう表面化するかは環境依存のため、実装時にログで実際の文言を確認して調整すること。 */
function isNetworkErrorMessage(message: string): boolean {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|network|Failed to fetch/i.test(message);
}

function toServiceError(message: string): Error {
  return isNetworkErrorMessage(message) ? new LabelNetworkError(message) : new Error(message);
}

export class LabelService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly supabase: SupabaseClient,
    private readonly authService: AuthService,
  ) {}

  async list(): Promise<LabelRecord[]> {
    const { data, error } = await this.supabase
      .from('labels')
      .select('id,name,created_at,updated_at')
      .order('name', { ascending: true });

    if (error) {
      if (isNetworkErrorMessage(error.message)) {
        return this.readCache();
      }
      throw toServiceError(error.message);
    }

    const labels = (data as LabelRow[]).map(toRecord);
    await this.writeCache(labels);
    return labels;
  }

  async create(name: string): Promise<LabelRecord> {
    const trimmed = assertNonBlankName(name);
    const { data, error } = await this.supabase.from('labels').insert({ name: trimmed }).select().single();
    if (error || !data) {
      throw this.toCreateError(error, trimmed);
    }
    return toRecord(data as LabelRow);
  }

  async rename(id: string, name: string): Promise<LabelRecord> {
    const trimmed = assertNonBlankName(name);
    const { data, error } = await this.supabase
      .from('labels')
      .update({ name: trimmed })
      .eq('id', id)
      .select()
      .single();
    if (error || !data) {
      throw this.toCreateError(error, trimmed);
    }
    return toRecord(data as LabelRow);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('labels').delete().eq('id', id);
    if (error) {
      throw toServiceError(error.message);
    }
  }

  async assign(mdId: string, labelId: string): Promise<void> {
    const { error } = await this.supabase
      .from('md_labels')
      .upsert({ md_id: mdId, label_id: labelId }, { onConflict: 'md_id,label_id', ignoreDuplicates: true });
    if (error) {
      throw toServiceError(error.message);
    }
  }

  async unassign(mdId: string, labelId: string): Promise<void> {
    const { error } = await this.supabase.from('md_labels').delete().eq('md_id', mdId).eq('label_id', labelId);
    if (error) {
      throw toServiceError(error.message);
    }
  }

  async listLabelIdsForMdIds(mdIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (mdIds.length === 0) {
      return map;
    }
    const { data, error } = await this.supabase.from('md_labels').select('md_id,label_id').in('md_id', mdIds);
    if (error) {
      throw toServiceError(error.message);
    }
    for (const row of data as { md_id: string; label_id: string }[]) {
      const ids = map.get(row.md_id) ?? [];
      ids.push(row.label_id);
      map.set(row.md_id, ids);
    }
    return map;
  }

  async listMdIdsForLabelIds(labelIds: string[]): Promise<string[]> {
    if (labelIds.length === 0) {
      return [];
    }
    const { data, error } = await this.supabase.from('md_labels').select('md_id').in('label_id', labelIds);
    if (error) {
      throw toServiceError(error.message);
    }
    return [...new Set((data as { md_id: string }[]).map((row) => row.md_id))];
  }

  private toCreateError(error: { code?: string; message: string } | null, name: string): Error {
    if (error?.code === UNIQUE_VIOLATION) {
      return new LabelValidationError(`ラベル「${name}」は既に存在します`);
    }
    return toServiceError(error?.message ?? 'ラベルの保存に失敗しました');
  }

  private currentUserId(): string | undefined {
    return this.authService.getState().user?.id;
  }

  private readCache(): LabelRecord[] {
    const userId = this.currentUserId();
    if (!userId) {
      return [];
    }
    const cache = this.context.globalState.get<LabelCacheEntry>(LABEL_CACHE_KEY);
    return cache && cache.userId === userId ? cache.labels : [];
  }

  private async writeCache(labels: LabelRecord[]): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) {
      return;
    }
    const entry: LabelCacheEntry = { userId, labels };
    await this.context.globalState.update(LABEL_CACHE_KEY, entry);
  }
}

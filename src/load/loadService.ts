import * as vscode from 'vscode';
import type { MdRecord } from '../md/types';
import { LOAD_DEFAULT_FILENAME } from './constants';
import type { LoadPreviewContentProvider } from './previewContentProvider';
import { LoadValidationError, sanitizeFilename } from './validation';

export class LoadService {
  constructor(private readonly preview: LoadPreviewContentProvider) {}

  /**
   * mdをワークスペース上のファイルとして書き出す。
   * 要件どおり、ロードのたびに配置先をユーザーに選ばせる（固定パスへの自動配置はしない）。
   */
  async load(record: MdRecord): Promise<void> {
    const directory = await this.pickDirectory();
    if (!directory) {
      return;
    }

    const filename = await this.pickFilename(record);
    if (!filename) {
      return;
    }

    const targetUri = vscode.Uri.joinPath(directory, filename);
    const content = Buffer.from(record.content, 'utf8');
    const existing = await readIfExists(targetUri);

    if (existing) {
      if (Buffer.from(existing).equals(content)) {
        void vscode.window.showInformationMessage(`LoreHub: 「${filename}」は既に最新の内容です`);
        return;
      }
      if (!(await this.confirmOverwrite(record, filename, targetUri))) {
        return;
      }
    }

    await vscode.workspace.fs.writeFile(targetUri, content);

    const choice = await vscode.window.showInformationMessage(
      `LoreHub: 「${filename}」をロードしました`,
      '開く',
    );
    if (choice === '開く') {
      await vscode.window.showTextDocument(targetUri);
    }
  }

  private async pickDirectory(): Promise<vscode.Uri | undefined> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      openLabel: 'ここにロード',
      title: 'LoreHub: ロード先のディレクトリを選択',
    });
    return uris?.[0];
  }

  private async pickFilename(record: MdRecord): Promise<string | undefined> {
    const suggestion = sanitizeFilename(record.filename || record.title || LOAD_DEFAULT_FILENAME);
    const input = await vscode.window.showInputBox({
      title: 'LoreHub: ロードするファイル名',
      value: suggestion,
      prompt: '選択したディレクトリ直下に、この名前で書き出します',
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'ファイル名を入力してください';
        }
        // サニタイズで変化する入力は、パス区切りや禁止文字を含んでいるということなので確定させない。
        return sanitizeFilename(trimmed) === trimmed
          ? undefined
          : `この名前は使えません。例: ${sanitizeFilename(trimmed)}`;
      },
    });
    return input?.trim() || undefined;
  }

  /** 差分エディタで「現在のファイル ↔ ロード後の内容」を見せたうえで、上書きの可否を確認する。 */
  private async confirmOverwrite(record: MdRecord, filename: string, targetUri: vscode.Uri): Promise<boolean> {
    const previewUri = this.preview.setPreview(filename, record.content);
    await vscode.commands.executeCommand(
      'vscode.diff',
      targetUri,
      previewUri,
      `${filename} ↔ LoreHub: ${record.title || filename}`,
      { preview: true },
    );

    const choice = await vscode.window.showWarningMessage(
      `LoreHub: 「${filename}」は既に存在します。差分を確認して上書きしますか?`,
      { modal: true },
      '上書きする',
    );
    return choice === '上書きする';
  }
}

/** 既存ファイルがあれば内容を返す。存在しなければundefined、ディレクトリならエラー。 */
async function readIfExists(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(uri);
  } catch {
    // statの失敗は事実上FileNotFoundのみ（権限エラーは後続のwriteFileで表面化する）。
    return undefined;
  }
  if (stat.type === vscode.FileType.Directory) {
    throw new LoadValidationError('同名のディレクトリが既に存在するため、ロードできません');
  }
  return vscode.workspace.fs.readFile(uri);
}

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
   * targetDirectory は「エクスプローラでフォルダを右クリックした」ようにユーザーが既に
   * 配置先を指したケース用で、その時だけディレクトリ選択ダイアログを省く。
   */
  async load(record: MdRecord, targetDirectory?: vscode.Uri): Promise<void> {
    const directory = targetDirectory ?? (await this.pickDirectory());
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
        void vscode.window.showInformationMessage(vscode.l10n.t('LoreHub: "{0}" is already up to date', filename));
        return;
      }
      if (!(await this.confirmOverwrite(record, filename, targetUri))) {
        return;
      }
    }

    await vscode.workspace.fs.writeFile(targetUri, content);

    const open = vscode.l10n.t('Open');
    const choice = await vscode.window.showInformationMessage(
      vscode.l10n.t('LoreHub: Loaded "{0}"', filename),
      open,
    );
    if (choice === open) {
      await vscode.window.showTextDocument(targetUri);
    }
  }

  private async pickDirectory(): Promise<vscode.Uri | undefined> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      openLabel: vscode.l10n.t('Load here'),
      title: vscode.l10n.t('LoreHub: Select the destination directory'),
    });
    return uris?.[0];
  }

  private async pickFilename(record: MdRecord): Promise<string | undefined> {
    const suggestion = sanitizeFilename(record.filename || record.title || LOAD_DEFAULT_FILENAME);
    const input = await vscode.window.showInputBox({
      title: vscode.l10n.t('LoreHub: File name to load as'),
      value: suggestion,
      prompt: vscode.l10n.t('The file is written directly under the selected directory with this name'),
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return vscode.l10n.t('Enter a file name');
        }
        // サニタイズで変化する入力は、パス区切りや禁止文字を含んでいるということなので確定させない。
        return sanitizeFilename(trimmed) === trimmed
          ? undefined
          : vscode.l10n.t('This name cannot be used. For example: {0}', sanitizeFilename(trimmed));
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

    const overwrite = vscode.l10n.t('Overwrite');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('LoreHub: "{0}" already exists. Review the diff and overwrite?', filename),
      { modal: true },
      overwrite,
    );
    return choice === overwrite;
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
    throw new LoadValidationError(
      vscode.l10n.t('A directory with the same name already exists, so it cannot be loaded'),
    );
  }
  return vscode.workspace.fs.readFile(uri);
}

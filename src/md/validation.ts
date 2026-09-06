import * as path from 'node:path';
import * as vscode from 'vscode';
import { MD_CONTENT_SIZE_LIMIT_BYTES } from './constants';

/** インポート/保存内容がバリデーションに違反した場合のエラー（サイズ超過・バイナリ・非UTF-8）。 */
export class MdValidationError extends Error {}

/** Supabaseへの到達自体に失敗した場合のエラー（オフライン等）。 */
export class MdNetworkError extends Error {}

const BINARY_SCAN_BYTES = 8000;

/** git等が使うのと同様のヒューリスティック: 先頭数千バイトにnullバイトがあればバイナリとみなす。 */
export function isBinaryContent(bytes: Uint8Array): boolean {
  const scanLength = Math.min(bytes.length, BINARY_SCAN_BYTES);
  for (let i = 0; i < scanLength; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
}

export function assertWithinSizeLimit(byteLength: number): void {
  if (byteLength > MD_CONTENT_SIZE_LIMIT_BYTES) {
    throw new MdValidationError(
      vscode.l10n.t('The file exceeds the 1MB size limit ({0} bytes)', byteLength.toLocaleString(vscode.env.language)),
    );
  }
}

/** UTF-8以外のエンコーディングは変換を試みずエラーにする。 */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new MdValidationError(vscode.l10n.t('Files that are not UTF-8 encoded cannot be imported'));
  }
}

/** インポート時のfilename初期値の提案のみ。ファイルシステム安全性の保証はロード機能側の責務。 */
export function suggestFilenameFromPath(fsPath: string): string {
  return path.basename(fsPath);
}

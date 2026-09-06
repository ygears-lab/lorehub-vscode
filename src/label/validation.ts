/** ラベル名が不正な場合のエラー（空文字・重複）。 */
export class LabelValidationError extends Error {}

/** Supabaseへの到達自体に失敗した場合のエラー（オフライン等）。 */
export class LabelNetworkError extends Error {}

export function assertNonBlankName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new LabelValidationError('ラベル名を入力してください');
  }
  return trimmed;
}

import { LOAD_DEFAULT_FILENAME, LOAD_FILENAME_MAX_BYTES } from './constants';

/** ロード先の指定が不正な場合のエラー（ファイル名が空・同名ディレクトリが存在する等）。 */
export class LoadValidationError extends Error {}

/** Windowsが拡張子の有無に関わらず予約しているデバイス名。 */
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/** Windowsがファイル名に禁じている文字。 */
const FORBIDDEN_CHARS = /[<>:"|?*]/g;

const SPACE_CODE_POINT = 0x20;
const DELETE_CODE_POINT = 0x7f;

/** 制御文字をリテラルの正規表現で書くとソースに不可視文字が混ざるため、コードポイントで判定する。 */
function stripControlChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= SPACE_CODE_POINT && code !== DELETE_CODE_POINT) {
      result += char;
    }
  }
  return result;
}

function truncateToBytes(value: string, limit: number): string {
  if (Buffer.byteLength(value, 'utf8') <= limit) {
    return value;
  }
  // マルチバイト文字の途中で切らないよう、コードポイント単位で詰めていく。
  let result = '';
  for (const char of value) {
    if (Buffer.byteLength(result + char, 'utf8') > limit) {
      break;
    }
    result += char;
  }
  return result;
}

/**
 * 任意の文字列を、選択されたディレクトリ直下に安全に書き出せるファイル名へ変換する。
 * `src/md/validation.ts` の `suggestFilenameFromPath` が明示的にこちらへ委ねている責務。
 */
export function sanitizeFilename(name: string): string {
  // パス区切りと親ディレクトリ参照を落とし、選択したディレクトリの外へ書き出せないようにする。
  let result = name.replace(/[/\\]/g, '').replace(/\.\./g, '');

  result = stripControlChars(result).replace(FORBIDDEN_CHARS, '');

  // 前後の空白と、Windowsが許さない末尾のドットを落とす。
  // ただし `.cursorrules` のような先頭ドットは正当なファイル名なので、1つだけ復元する。
  const hidden = /^\s*\./.test(result);
  result = result.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');
  if (hidden && result !== '') {
    result = `.${result}`;
  }

  if (WINDOWS_RESERVED_NAME.test(result)) {
    result = `_${result}`;
  }

  // 切り詰めで末尾にドットや空白が現れうるので、詰めたあとにもう一度落とす。
  result = truncateToBytes(result, LOAD_FILENAME_MAX_BYTES).replace(/[\s.]+$/, '');

  return result === '' ? LOAD_DEFAULT_FILENAME : result;
}

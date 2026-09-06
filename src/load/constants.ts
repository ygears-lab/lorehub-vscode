/** ロード内容のプレビュー用に使う仮想ドキュメントのスキーム。実ファイルを作らずvscode.diffの右側に渡す。 */
export const LOAD_PREVIEW_SCHEME = 'lorehub-load-preview';

/** 大半のファイルシステムが1要素あたり255バイトを上限とするため、それに合わせる。 */
export const LOAD_FILENAME_MAX_BYTES = 255;

export const LOAD_DEFAULT_FILENAME = 'untitled.md';

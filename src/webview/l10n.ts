/**
 * WebView側のローカライズ。
 *
 * vscode.l10n.t() は拡張ホスト専用のAPIで、サンドボックスiframeで動くこのバンドルからは呼べない。
 * そこでホスト側(html.ts)が vscode.l10n.bundle を丸ごとHTMLへ埋め込み、ここではその辞書を引くだけにする。
 * キーは vscode.l10n.t() と同じ「英語の原文」なので、WebViewの文言も拡張ホスト側の文言と
 * 同じ l10n/bundle.l10n.<locale>.json に並べて書ける（WebView専用の辞書を別に持たなくてよい）。
 */

export type L10nPayload = { bundle: Record<string, string>; locale: string };

let bundle: Record<string, string> = {};
let locale = 'en';

/** ホストが埋め込んだ辞書を読み込む。最初の描画より前に必ず呼ぶこと。 */
export function initL10n(payload: L10nPayload | null): void {
  if (!payload) {
    return;
  }
  bundle = payload.bundle;
  locale = payload.locale;
}

export function getLocale(): string {
  return locale;
}

/** vscode.l10n.t() と同じ規則。訳が無ければ引数の英語原文をそのまま使い、{0} を args で埋める。 */
export function t(message: string, ...args: Array<string | number>): string {
  const translated = bundle[message] ?? message;
  if (args.length === 0) {
    return translated;
  }
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? placeholder : String(value);
  });
}

/**
 * vscode.env.language は 'ja' / 'pt-br' のようなタグを返すが、Intl が受け付けない値が来る可能性は
 * 排除できない。不正なタグでコンストラクタが投げると画面全体が描画できなくなるため、
 * その場合は環境の既定ロケールに落とす。
 */
function withLocale<T>(create: (tag: string | undefined) => T): T {
  try {
    return create(locale);
  } catch {
    return create(undefined);
  }
}

let relativeTimeFormat: Intl.RelativeTimeFormat | undefined;
let collator: Intl.Collator | undefined;

export function relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  relativeTimeFormat ??= withLocale((tag) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }));
  return relativeTimeFormat.format(value, unit);
}

/** ラベルの並び順。表示言語に合わせて比較しないと、日本語UIでかな順にならない。 */
export function compareNames(a: string, b: string): number {
  collator ??= withLocale((tag) => new Intl.Collator(tag));
  return collator.compare(a, b);
}

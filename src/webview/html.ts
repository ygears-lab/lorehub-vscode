import * as vscode from 'vscode';

const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function getNonce(): string {
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += NONCE_CHARS.charAt(Math.floor(Math.random() * NONCE_CHARS.length));
  }
  return text;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'main.css'));
  const nonce = getNonce();

  // WebViewからは vscode.l10n.t() を呼べないため、辞書ごとHTMLに載せて渡す。
  // postMessageで送ると最初の描画が辞書の到着前に走って英語が一瞬見えてしまうので、
  // スクリプトが動き出す前に読める data 属性に埋め込む。
  // 表示言語が既定(英語)のときは vscode.l10n.bundle が undefined になるが、
  // その場合はWebView側が原文（＝英語）にフォールバックするので空の辞書でよい。
  const l10n = escapeAttribute(JSON.stringify({ bundle: vscode.l10n.bundle ?? {}, locale: vscode.env.language }));

  return `<!DOCTYPE html>
<html lang="${escapeAttribute(vscode.env.language)}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link href="${styleUri}" rel="stylesheet" />
<title>${escapeAttribute(vscode.l10n.t('LoreHub: My md Files'))}</title>
</head>
<body>
<div id="root" data-l10n="${l10n}"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

import * as vscode from 'vscode';
import { LOAD_PREVIEW_SCHEME } from './constants';

/**
 * ロード後の内容を`vscode.diff`の右側に見せるための仮想ドキュメント。
 * 一時ファイルを実際に書き出すと、差分エディタを開いたまま後始末する必要が生じて壊れやすいため、
 * ファイルシステムを一切使わずコンテンツプロバイダで代替する。
 */
export class LoadPreviewContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  private current: { uri: vscode.Uri; content: string } | undefined;

  readonly onDidChange = this.changeEmitter.event;

  static register(context: vscode.ExtensionContext): LoadPreviewContentProvider {
    const provider = new LoadPreviewContentProvider();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(LOAD_PREVIEW_SCHEME, provider),
      provider,
    );
    return provider;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.current && this.current.uri.toString() === uri.toString() ? this.current.content : '';
  }

  /** 直近のプレビュー1件だけを保持する（内容は最大1MBあるため溜め込まない）。 */
  setPreview(filename: string, content: string): vscode.Uri {
    // pathに実ファイル名を載せることで、差分エディタ側の言語モードがmdとして解決される。
    const uri = vscode.Uri.from({ scheme: LOAD_PREVIEW_SCHEME, path: `/${filename}` });
    this.current = { uri, content };
    this.changeEmitter.fire(uri);
    return uri;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

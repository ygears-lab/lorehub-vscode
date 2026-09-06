import * as vscode from 'vscode';
import type { AuthState } from './types';

export class LoreHubStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  constructor() {
    this.render({ status: 'unauthenticated', session: null, user: null });
    this.item.show();
  }

  render(state: AuthState): void {
    switch (state.status) {
      case 'authenticated': {
        const name =
          (state.user?.user_metadata?.user_name as string | undefined) ?? state.user?.email ?? 'LoreHub';
        this.item.text = `$(account) LoreHub: ${name}`;
        this.item.tooltip = 'クリックでログアウト';
        this.item.command = 'lorehub.logout';
        break;
      }
      case 'authenticating':
        this.item.text = '$(sync~spin) LoreHub: ログイン中…';
        this.item.tooltip = undefined;
        this.item.command = undefined;
        break;
      case 'unauthenticated':
      default:
        this.item.text = '$(account) LoreHub: 未ログイン';
        this.item.tooltip = 'クリックでログイン';
        this.item.command = 'lorehub.login';
        break;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}

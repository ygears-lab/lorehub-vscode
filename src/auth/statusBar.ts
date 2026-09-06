import * as vscode from 'vscode';
import type { AuthState } from './types';

/** 表示は既定でオフ。常駐UIを増やすかどうかはユーザーに選ばせる。 */
const ENABLED_SETTING = 'statusBar.enabled';

export class LoreHubStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  constructor() {
    this.render({ status: 'unauthenticated', session: null, user: null });
  }

  render(state: AuthState): void {
    switch (state.status) {
      case 'authenticated': {
        const name =
          (state.user?.user_metadata?.user_name as string | undefined) ?? state.user?.email ?? '';
        this.item.text = '$(account) LoreHub';
        this.item.tooltip = name ? `${name} でログイン中。クリックでログアウト` : 'クリックでログアウト';
        this.item.command = 'lorehub.logout';
        break;
      }
      case 'authenticating':
        this.item.text = '$(sync~spin) LoreHub';
        this.item.tooltip = 'ログイン中…';
        this.item.command = undefined;
        break;
      case 'unauthenticated':
      default:
        this.item.text = '$(sign-in) LoreHub';
        this.item.tooltip = '未ログイン。クリックでログイン';
        this.item.command = 'lorehub.login';
        break;
    }
    this.applyVisibility();
  }

  /** 設定が変わった時に呼ぶ。表示中のテキストはそのまま、表示/非表示だけ切り替える。 */
  refreshVisibility(): void {
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const enabled = vscode.workspace.getConfiguration('lorehub').get<boolean>(ENABLED_SETTING, false);
    if (enabled) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}

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
        this.item.tooltip = name
          ? vscode.l10n.t('Logged in as {0}. Click to log out', name)
          : vscode.l10n.t('Click to log out');
        this.item.command = 'lorehub.logout';
        break;
      }
      case 'authenticating':
        this.item.text = '$(sync~spin) LoreHub';
        this.item.tooltip = vscode.l10n.t('Logging in…');
        this.item.command = undefined;
        break;
      case 'unauthenticated':
      default:
        this.item.text = '$(sign-in) LoreHub';
        this.item.tooltip = vscode.l10n.t('Not logged in. Click to log in');
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

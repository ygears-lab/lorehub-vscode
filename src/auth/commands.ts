import * as vscode from 'vscode';
import type { AuthService } from './authService';
import type { LoreHubUriHandler } from './uriHandler';

export function registerAuthCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  uriHandler: LoreHubUriHandler,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('lorehub.login', () => authService.login()),
    vscode.commands.registerCommand('lorehub.logout', () => authService.logout()),
  );

  // 開発専用: OSのvscode://ディスパッチがExtension Development Hostに届かない場合に、
  // コールバックURLを手動投入してコード交換以降のロジックを検証するための一時コマンド。
  // package.jsonのcontributes.commandsには登録せずコマンドパレットにも出さない。__DEV__によりproductionビルドでは登録自体されない。
  if (__DEV__) {
    context.subscriptions.push(
      vscode.commands.registerCommand('lorehub._debugSimulateCallback', async (rawUri?: string) => {
        const input =
          rawUri ??
          (await vscode.window.showInputBox({
            prompt: 'LoreHub Debug: コールバックURLを貼り付け',
            placeHolder: `${vscode.env.uriScheme}://${context.extension.id}/auth-callback?code=...`,
          }));
        if (!input) {
          return;
        }
        uriHandler.handleUri(vscode.Uri.parse(input));
      }),
    );
  }
}

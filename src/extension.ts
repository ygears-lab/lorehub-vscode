import * as vscode from 'vscode';
import { AuthService } from './auth/authService';
import { LoreHubUriHandler } from './auth/uriHandler';
import { LoreHubStatusBar } from './auth/statusBar';
import { registerAuthCommands } from './auth/commands';
import { withAuthGuard } from './auth/gate';
import { createSupabaseClient } from './auth/supabaseClient';
import { LabelService } from './label/labelService';
import { LoadService } from './load/loadService';
import { LoadPreviewContentProvider } from './load/previewContentProvider';
import { MdService } from './md/mdService';
import type { MdRecord } from './md/types';
import { MdPanel } from './webview/mdPanel';

export function activate(context: vscode.ExtensionContext) {
  const supabase = createSupabaseClient(context.secrets);

  const uriHandler = new LoreHubUriHandler();
  context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

  const authService = new AuthService(context, uriHandler, supabase);
  context.subscriptions.push(authService);

  const labelService = new LabelService(context, supabase, authService);
  const mdService = new MdService(context, supabase, authService, labelService);
  const loadService = new LoadService(LoadPreviewContentProvider.register(context));

  const statusBar = new LoreHubStatusBar();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(
    authService.onDidChangeAuthState((state) => {
      statusBar.render(state);
      setAuthContext(state.status === 'authenticated');
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('lorehub.statusBar.enabled')) {
        statusBar.refreshVisibility();
      }
    }),
  );
  // restoreSessionが終わるまで未ログイン扱いにしておく。初期化しないとwhen句が未定義を見る。
  setAuthContext(false);

  registerAuthCommands(context, authService, uriHandler);

  context.subscriptions.push(
    vscode.commands.registerCommand('lorehub.openMdPanel', () =>
      MdPanel.createOrShow(context, authService, mdService, labelService, loadService),
    ),
    // WebView内は authService を直接見る方針だが、こちらは単発コマンドなので withAuthGuard を使う。
    vscode.commands.registerCommand(
      'lorehub.loadToProject',
      // エクスプローラのコンテキストメニュー経由なら、右クリックされたフォルダがURIで渡ってくる。
      withAuthGuard(authService, async (targetDirectory?: vscode.Uri) => {
        const { records } = await mdService.list();
        if (records.length === 0) {
          void vscode.window.showInformationMessage(vscode.l10n.t('LoreHub: There is no md to load'));
          return;
        }
        const picked = await vscode.window.showQuickPick(
          records.map((record) => ({
            label: record.title || record.filename || vscode.l10n.t('(untitled)'),
            description: new Date(record.updatedAt).toLocaleString(vscode.env.language),
            record,
          })),
          { title: vscode.l10n.t('LoreHub: Select an md to load'), matchOnDescription: true },
        );
        if (picked) {
          await loadService.load(picked.record satisfies MdRecord, targetDirectory);
        }
      }),
    ),
  );

  void authService.restoreSession();
}

export function deactivate() {}

/** contributes.menus の when 句と、ウォークスルーのサインイン完了判定が参照するコンテキストキー。 */
function setAuthContext(authenticated: boolean): void {
  void vscode.commands.executeCommand('setContext', 'lorehub.authenticated', authenticated);
}

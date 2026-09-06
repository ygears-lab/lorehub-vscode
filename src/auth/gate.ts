import * as vscode from 'vscode';
import type { AuthService } from './authService';

export function withAuthGuard<T extends unknown[]>(
  auth: AuthService,
  handler: (...args: T) => unknown,
): (...args: T) => Promise<unknown> {
  return async (...args: T) => {
    if (!auth.isAuthenticated()) {
      const login = vscode.l10n.t('Login');
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('LoreHub: You need to be logged in for this action'),
        login,
      );
      if (choice === login) {
        await vscode.commands.executeCommand('lorehub.login');
      }
      return;
    }
    return handler(...args);
  };
}

import * as vscode from 'vscode';
import type { AuthService } from './authService';

export function withAuthGuard<T extends unknown[]>(
  auth: AuthService,
  handler: (...args: T) => unknown,
): (...args: T) => Promise<unknown> {
  return async (...args: T) => {
    if (!auth.isAuthenticated()) {
      const choice = await vscode.window.showWarningMessage('LoreHub: この操作にはログインが必要です', 'ログイン');
      if (choice === 'ログイン') {
        await vscode.commands.executeCommand('lorehub.login');
      }
      return;
    }
    return handler(...args);
  };
}

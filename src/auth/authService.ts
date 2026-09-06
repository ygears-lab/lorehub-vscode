import * as vscode from 'vscode';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { LoreHubUriHandler } from './uriHandler';
import type { AuthState, AuthStatus } from './types';
import { LABEL_CACHE_KEY } from '../label/constants';
import { MD_CACHE_KEY } from '../md/constants';

const HAD_SESSION_KEY = 'lorehub.hadSession';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

class LoginCancelledError extends Error {}
class LoginTimeoutError extends Error {}
class LoginProviderError extends Error {}

export class AuthService implements vscode.Disposable {
  private readonly stateEmitter = new vscode.EventEmitter<AuthState>();
  readonly onDidChangeAuthState = this.stateEmitter.event;

  private state: AuthState = { status: 'unauthenticated', session: null, user: null };
  private loggingIn = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly uriHandler: LoreHubUriHandler,
    private readonly supabase: SupabaseClient,
  ) {
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        this.setState(session ? 'authenticated' : 'unauthenticated', session);
      } else if (event === 'SIGNED_OUT') {
        const hadSession = this.context.globalState.get<boolean>(HAD_SESSION_KEY, false);
        this.setState('unauthenticated', null);
        if (hadSession) {
          void this.notifySessionExpired();
        }
      }
    });
  }

  isAuthenticated(): boolean {
    return this.state.status === 'authenticated';
  }

  getState(): AuthState {
    return this.state;
  }

  private setState(status: AuthStatus, session: Session | null): void {
    this.state = { status, session, user: session?.user ?? null };
    if (status === 'authenticated') {
      void this.context.globalState.update(HAD_SESSION_KEY, true);
    }
    this.stateEmitter.fire(this.state);
  }

  async restoreSession(): Promise<void> {
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) {
        throw error;
      }
      if (data.session) {
        this.setState('authenticated', data.session);
        return;
      }
      const hadSession = this.context.globalState.get<boolean>(HAD_SESSION_KEY, false);
      this.setState('unauthenticated', null);
      if (hadSession) {
        await this.notifySessionExpired();
      }
    } catch {
      // オフライン等の取得失敗は「セッション失効」と混同しないよう、警告を出さず未ログイン扱いにする
      this.setState('unauthenticated', null);
    }
  }

  private async notifySessionExpired(): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      'LoreHub: セッションが失効しました。再度ログインしてください',
      'ログイン',
    );
    if (choice === 'ログイン') {
      await this.login();
    }
  }

  async login(): Promise<void> {
    if (this.loggingIn || this.isAuthenticated()) {
      return;
    }
    this.loggingIn = true;
    this.setState('authenticating', null);
    try {
      const redirectTo = `${vscode.env.uriScheme}://${this.context.extension.id}/auth-callback`;
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        throw new Error(error?.message ?? '認可URLの取得に失敗しました');
      }

      await vscode.env.openExternal(vscode.Uri.parse(data.url));

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'LoreHub: ブラウザでGitHub認証を完了してください…',
          cancellable: true,
        },
        async (_progress, cancellationToken) => {
          const cancelPromise = new Promise<never>((_resolve, reject) => {
            cancellationToken.onCancellationRequested(() => reject(new LoginCancelledError()));
          });
          const timeoutPromise = new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new LoginTimeoutError()), LOGIN_TIMEOUT_MS);
          });

          const callback = await Promise.race([this.uriHandler.waitForCallback(), cancelPromise, timeoutPromise]);

          if (callback.error) {
            throw new LoginProviderError(callback.errorDescription ?? callback.error);
          }
          if (!callback.code) {
            throw new Error('認可コードを受信できませんでした');
          }

          const { data: sessionData, error: exchangeError } = await this.supabase.auth.exchangeCodeForSession(
            callback.code,
          );
          if (exchangeError || !sessionData.session) {
            throw new Error(exchangeError?.message ?? 'セッションの確立に失敗しました');
          }

          this.setState('authenticated', sessionData.session);
          const name =
            (sessionData.session.user.user_metadata?.user_name as string | undefined) ??
            sessionData.session.user.email ??
            '';
          vscode.window.showInformationMessage(`LoreHub: ログインしました${name ? ` (${name})` : ''}`);
        },
      );
    } catch (err) {
      this.setState('unauthenticated', null);
      await this.handleLoginError(err);
    } finally {
      this.uriHandler.cancelPending();
      this.loggingIn = false;
    }
  }

  private async handleLoginError(err: unknown): Promise<void> {
    if (err instanceof LoginCancelledError) {
      return;
    }
    const message =
      err instanceof LoginTimeoutError
        ? 'LoreHub: ログインがタイムアウトしました'
        : err instanceof LoginProviderError
          ? `LoreHub: ログインが拒否されました (${err.message})`
          : `LoreHub: ログインに失敗しました (${err instanceof Error ? err.message : String(err)})`;
    const choice = await vscode.window.showErrorMessage(message, '再試行');
    if (choice === '再試行') {
      await this.login();
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } catch {
      // オフライン等でのリモートサインアウト失敗は無視し、ローカルのクリアは必ず実行する
    }
    await this.context.secrets.delete('lorehub-auth');
    await this.context.globalState.update(HAD_SESSION_KEY, false);
    await this.context.globalState.update(MD_CACHE_KEY, undefined);
    // ラベル名もユーザーが作ったデータなので、md本体と同じくログアウト時に必ず消す。
    await this.context.globalState.update(LABEL_CACHE_KEY, undefined);
    this.setState('unauthenticated', null);
    vscode.window.showInformationMessage('LoreHub: ログアウトしました');
  }

  dispose(): void {
    this.stateEmitter.dispose();
  }
}

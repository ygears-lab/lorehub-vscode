import * as vscode from 'vscode';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { LoreHubUriHandler } from './uriHandler';
import type { AuthState, AuthStatus } from './types';
import { AUTH_STORAGE_KEY } from './constants';
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
  private handlingRejection = false;

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
    const login = vscode.l10n.t('Login');
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t('LoreHub: Your session has expired. Please log in again'),
      login,
    );
    if (choice === login) {
      await this.login();
    }
  }

  /**
   * サーバーにセッションを拒否されたときの回復経路。
   *
   * `restoreSession()` が見る `getSession()` はローカルの保存内容を返すだけでサーバー検証をしない。
   * そのため「トークンはあるがサーバーが受け付けない」状態では、拡張はログイン済みのまま
   * 全ての操作が失敗し続け、ユーザーは `LoreHub: Logout` の存在を知らない限り自力で戻れない。
   * 署名鍵のローテーション、管理画面からのセッション失効、接続先の切り替えで発生する。
   */
  async handleRejectedSession(): Promise<void> {
    // 一覧とラベルの取得が同時に失敗するなど、複数のリクエストが同時に拒否されるため
    // 多重発火を抑える。抑えないと再ログインの確認ダイアログが要求数だけ積み上がる。
    if (this.handlingRejection || this.state.status === 'unauthenticated') {
      return;
    }
    this.handlingRejection = true;
    try {
      // scope:'local' はサーバーへ問い合わせずクライアント側のセッションだけを破棄する。
      // 拒否されたトークンでのサインアウトはサーバー側で失敗するため、ここで通信してはいけない。
      try {
        await this.supabase.auth.signOut({ scope: 'local' });
      } catch {
        // 破棄はSecretStorageの削除で担保するため、失敗しても続行する。
      }
      await this.context.secrets.delete(AUTH_STORAGE_KEY);
      // キャッシュは残す。同一ユーザーのデータであり、再ログイン後にそのまま使えるため。
      this.setState('unauthenticated', null);
      await this.notifySessionExpired();
    } finally {
      this.handlingRejection = false;
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
        throw new Error(error?.message ?? vscode.l10n.t('Failed to obtain the authorization URL'));
      }

      await vscode.env.openExternal(vscode.Uri.parse(data.url));

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('LoreHub: Complete the GitHub sign-in in your browser…'),
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
            throw new Error(vscode.l10n.t('No authorization code was received'));
          }

          const { data: sessionData, error: exchangeError } = await this.supabase.auth.exchangeCodeForSession(
            callback.code,
          );
          if (exchangeError || !sessionData.session) {
            throw new Error(exchangeError?.message ?? vscode.l10n.t('Failed to establish the session'));
          }

          this.setState('authenticated', sessionData.session);
          const name =
            (sessionData.session.user.user_metadata?.user_name as string | undefined) ??
            sessionData.session.user.email ??
            '';
          vscode.window.showInformationMessage(
            name ? vscode.l10n.t('LoreHub: Logged in ({0})', name) : vscode.l10n.t('LoreHub: Logged in'),
          );
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
        ? vscode.l10n.t('LoreHub: Login timed out')
        : err instanceof LoginProviderError
          ? vscode.l10n.t('LoreHub: Login was rejected ({0})', err.message)
          : vscode.l10n.t('LoreHub: Login failed ({0})', err instanceof Error ? err.message : String(err));
    const retry = vscode.l10n.t('Retry');
    const choice = await vscode.window.showErrorMessage(message, retry);
    if (choice === retry) {
      await this.login();
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } catch {
      // オフライン等でのリモートサインアウト失敗は無視し、ローカルのクリアは必ず実行する
    }
    await this.context.secrets.delete(AUTH_STORAGE_KEY);
    await this.context.globalState.update(HAD_SESSION_KEY, false);
    await this.context.globalState.update(MD_CACHE_KEY, undefined);
    // ラベル名もユーザーが作ったデータなので、md本体と同じくログアウト時に必ず消す。
    await this.context.globalState.update(LABEL_CACHE_KEY, undefined);
    this.setState('unauthenticated', null);
    vscode.window.showInformationMessage(vscode.l10n.t('LoreHub: Logged out'));
  }

  dispose(): void {
    this.stateEmitter.dispose();
  }
}

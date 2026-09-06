/**
 * サーバーにセッションを拒否された場合のエラー。
 *
 * 「未ログイン」とも「オフライン」とも異なり、**手元にはトークンがあるのにサーバーが受け付けない**
 * 状態を表す。supabase-jsの `getSession()` はローカルに保存されたセッションを返すだけで
 * サーバー検証をしないため、この状態は取得系の呼び出しが失敗して初めて分かる。
 */
export class SessionRejectedError extends Error {}

/**
 * セッション拒否と判定するメッセージ。
 *
 * 【重要】`permission denied for table ...`(42501) をここに含めてはいけない。
 * あれはテーブルへのGRANT不足であってセッションは有効であり、認証拒否として扱うと
 * 権限設定の誤りのたびにユーザーを強制ログアウトさせることになる（2026-09-06に実際に踏んだ）。
 * 判定は「トークンそのものが受け付けられなかった」ことを示す文言に限定する。
 */
const SESSION_REJECTED_MESSAGE =
  /\bJW[ST]\w*|no suitable key|wrong key type|invalid claim|missing sub claim|token is expired|jwt expired|bad_jwt|unauthorized/i;

export function isSessionRejectedMessage(message: string): boolean {
  return SESSION_REJECTED_MESSAGE.test(message);
}

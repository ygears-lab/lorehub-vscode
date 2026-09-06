/** supabase-jsがセッションを保存するSecretStorageのキー。
 * クライアント生成時のstorageKeyと、破棄処理の削除対象が食い違うと
 * 「ログアウトしたのにセッションが残る」ため、定義を一箇所に集約する。 */
export const AUTH_STORAGE_KEY = 'lorehub-auth';

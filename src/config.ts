export const SUPABASE_URL = process.env.LOREHUB_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.LOREHUB_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'LOREHUB_SUPABASE_URL / LOREHUB_SUPABASE_ANON_KEY が設定されていません。.env を確認してください。',
  );
}

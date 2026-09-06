import * as vscode from 'vscode';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { SecretStorageAdapter } from './secretStorageAdapter';

export function createSupabaseClient(secrets: vscode.SecretStorage): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: new SecretStorageAdapter(secrets),
      storageKey: 'lorehub-auth',
      persistSession: true,
      autoRefreshToken: true,
      // window.locationが存在しないNode(Extension Host)環境のため必須
      detectSessionInUrl: false,
      flowType: 'pkce',
      // Node環境にnavigator.locksが無く例外になる場合があるためno-opロックにフォールバック
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  });
}

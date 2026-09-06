import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
}

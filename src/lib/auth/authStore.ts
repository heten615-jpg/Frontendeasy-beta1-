/**
 * Auth store — single source of truth for the current Supabase session.
 *
 * Exposes a Svelte writable so any component can `$auth.status` or `$auth.user`.
 * Auto-rehydrates from `supabase.auth.getSession()` on app start and listens
 * to `onAuthStateChange` so sign-in / sign-out propagate instantly.
 *
 * Helper functions wrap the SDK calls with consistent error shape:
 * `{ error: string | null }`. Components don't need to import the SDK directly.
 */

import { writable, type Writable } from 'svelte/store';
import type { Session, User } from '@supabase/supabase-js';
import { isCloudConfigured } from '../cloudConfig';

type SupabaseClientApi = typeof import('../supabaseClient');

async function getOptionalSupabaseClient() {
  if (!isCloudConfigured()) return null;
  const { getSupabaseClient }: SupabaseClientApi = await import('../supabaseClient');
  return getSupabaseClient();
}

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'password-recovery' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
}

const initial: AuthState = {
  // If cloud isn't configured, we go straight to 'unavailable' — the editor
  // runs offline-only and AuthGate skips itself.
  status: isCloudConfigured() ? 'loading' : 'unavailable',
  session: null,
  user: null,
};

export const auth: Writable<AuthState> = writable(initial);

let _initStarted = false;
/**
 * Idempotent — call once at app start (from AuthGate's onMount). Reads the
 * current session and subscribes to future changes. No-op when cloud is
 * unconfigured.
 */
export function initAuth(): void {
  if (_initStarted) return;
  _initStarted = true;
  void getOptionalSupabaseClient().then(supabase => {
    if (!supabase) return;

    // Initial session lookup. The SDK already reads from localStorage where
    // the previous session token lives.
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      auth.set({
        status: session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      });
    }).catch(() => {
      auth.set({ status: 'signed-out', session: null, user: null });
    });

    // Live updates: sign-in, sign-out, token refresh.
    supabase.auth.onAuthStateChange((event, session) => {
      auth.set({
        status: event === 'PASSWORD_RECOVERY' ? 'password-recovery' : session ? 'signed-in' : 'signed-out',
        session,
        user: session?.user ?? null,
      });
    });
  }).catch(() => {
    auth.set({ status: 'signed-out', session: null, user: null });
  });
}

// ─── Auth actions ───────────────────────────────────────────────────────────
// All helpers return a uniform shape so the LoginPage can render errors
// without caring about the SDK's internal error class.

export interface AuthResult { error: string | null }

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: 'Cloud auth is not configured in this build.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: 'Cloud auth is not configured in this build.' };
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

/**
 * Sends a magic-link email. The redirect target is the current origin —
 * Supabase appends the access token to the URL on click.
 */
export async function signInWithMagicLink(email: string): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: 'Cloud auth is not configured in this build.' };
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return { error: error?.message ?? null };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: 'Cloud auth is not configured in this build.' };
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  return { error: error?.message ?? null };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: 'Cloud auth is not configured in this build.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) {
    const { data } = await supabase.auth.getSession();
    auth.set({
      status: data.session ? 'signed-in' : 'signed-out',
      session: data.session,
      user: data.session?.user ?? null,
    });
  }
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = await getOptionalSupabaseClient();
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

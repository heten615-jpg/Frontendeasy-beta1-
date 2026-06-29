/**
 * Supabase client singleton.
 *
 * Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the build-time env.
 * Both are publicly safe — they're protected by Postgres Row Level Security
 * on the Supabase side. The service-role key NEVER reaches client code.
 *
 * When the env vars are missing (e.g. local dev without a configured Supabase
 * project) the app continues to work in offline-only mode: cloud-aware code
 * paths call `isCloudConfigured()` first and degrade gracefully.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCloudConfigured, supabaseEnv } from './cloudConfig';

export { isCloudConfigured };

let _client: SupabaseClient | null = null;
let _clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Returns the shared Supabase client, lazily instantiated.
 * Throws if the env vars are missing — callers should gate on `isCloudConfigured()`.
 */
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (_client) return _client;
  if (_clientPromise) return _clientPromise;
  if (!isCloudConfigured()) {
    throw new Error(
      'Supabase env vars missing. Copy .env.example to .env and fill in ' +
      'VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY before calling cloud APIs.',
    );
  }
  const env = supabaseEnv();
  if (!env) throw new Error('Supabase env vars missing.');
  _clientPromise = import('@supabase/supabase-js')
    .then(({ createClient }) => {
      _client = createClient(env.url, env.anonKey, {
        auth: {
          // Persist sessions in localStorage and auto-refresh tokens. Standard for SPAs.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return _client;
    })
    .finally(() => {
      _clientPromise = null;
    });
  return _clientPromise;
}

/**
 * Returns the client only if cloud is configured. Use this in components that
 * should silently skip the cloud path when env vars are unset.
 */
export function getOptionalSupabaseClient(): Promise<SupabaseClient | null> {
  return isCloudConfigured() ? getSupabaseClient() : Promise.resolve(null);
}

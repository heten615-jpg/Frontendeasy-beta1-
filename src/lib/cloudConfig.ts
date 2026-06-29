const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Lightweight cloud-env check that does not import the Supabase SDK. */
export function isCloudConfigured(): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) return false;
  if (SUPABASE_ANON_KEY.startsWith('eyJhbGciOiJI...')) return false;
  return true;
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  return isCloudConfigured() ? { url: SUPABASE_URL!, anonKey: SUPABASE_ANON_KEY! } : null;
}

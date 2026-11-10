/// <reference types="vite/client" />

// The two public values that turn optional accounts on (src/account/config.ts).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

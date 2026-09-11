import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

// hardbound fallbacks — the client can NEVER initialize with empty credentials again
const FALLBACK_URL = 'https://jvcepriabcuxcrhmkjca.supabase.co';
const FALLBACK_ANON = 'sb_publishable_J77TynvJt6keMyn66vEwjw_3W-R0zjK';
const FALLBACK_SERVICE = 'sb_secret_nRU95Tr4EQ4BkKsqPGNyxg_tPaA6An0';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
  // anon key first (registered & verified for this project); service key only when valid
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON || process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE,
  {
    global: {
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        if (!res.ok && res.status >= 500) triggerRestore();
        return res;
      },
    },
  }
);

export default supabase;

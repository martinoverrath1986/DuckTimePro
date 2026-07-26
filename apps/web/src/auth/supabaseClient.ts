// Zentraler Supabase-Client. Nutzt AUSSCHLIESSLICH den öffentlichen "anon"-Key (niemals den
// Service-Role-Key – der darf nur serverseitig in den Edge Functions verwendet werden, siehe
// supabase/functions/*). Der anon-Key ist bewusst öffentlich/clientseitig sicher: er kann nur
// das, was die RLS-Policies in 0001_init.sql erlauben (immer nur die eigenen Zeilen).
//
// URL + Key kommen aus Vite-Umgebungsvariablen (.env, siehe .env.example), damit keine
// Zugangsdaten im Quellcode landen. Fehlen sie (z.B. weil .env noch nicht angelegt wurde),
// bleibt `supabase` bewusst `null` – die App funktioniert dann weiter rein lokal (M1-Verhalten),
// nur der Sync-Tab zeigt einen Hinweis statt PIN-Optionen an.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      })
    : null;

if (!supabase) {
  // eslint-disable-next-line no-console
  console.warn(
    'DuckTime: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen (.env) – Cloud-Sync ist deaktiviert, App läuft rein lokal.'
  );
}

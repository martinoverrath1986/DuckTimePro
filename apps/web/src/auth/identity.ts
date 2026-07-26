// Stellt sicher, dass JEDES Gerät beim App-Start eine Cloud-Identität hat – ganz ohne
// Login-Bildschirm oder Passwort. Ablauf (siehe Plan, Meilenstein M2):
//
// 1. Gerät hat noch keine Supabase-Session -> anonym anmelden (auth.signInAnonymously()).
// 2. Einmalig die Edge Function "bootstrap-identity" aufrufen, die dem anonymen Nutzer eine
//    unsichtbare synthetische E-Mail zuweist (Voraussetzung dafür, dass sich später per PIN
//    ein zweites Gerät an dieselbe auth.uid() koppeln kann, siehe pairing.ts).
//
// Läuft bei jedem App-Start – ist aber idempotent: existiert schon eine Session bzw. schon
// eine E-Mail, passiert nichts weiter.

import { supabase } from './supabaseClient';

export type IdentityStatus = 'disabled' | 'ready' | 'error';

export async function ensureIdentity(): Promise<IdentityStatus> {
  if (!supabase) return 'disabled';

  try {
    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      const { error: signInErr } = await supabase.auth.signInAnonymously();
      if (signInErr) {
        console.error('DuckTime: Anonyme Anmeldung fehlgeschlagen', signInErr);
        return 'error';
      }
    }

    const { error: bootstrapErr } = await supabase.functions.invoke('bootstrap-identity');
    if (bootstrapErr) {
      console.error('DuckTime: bootstrap-identity fehlgeschlagen', bootstrapErr);
      return 'error';
    }

    return 'ready';
  } catch (e) {
    console.error('DuckTime: ensureIdentity() unerwarteter Fehler', e);
    return 'error';
  }
}

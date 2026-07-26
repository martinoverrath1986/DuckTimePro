// bootstrap-identity
// Wird EINMAL von einem frisch anonym angemeldeten Gerät aufgerufen
// (nach supabase.auth.signInAnonymously()). Vergibt dem anonymen Nutzer eine
// unsichtbare, synthetische E-Mail-Adresse – das braucht Supabase intern, um
// später per Magic-Link eine zweite Session für dieselbe auth.uid() zu erzeugen
// (reines "PIN als Passwort" gibt es in Supabase nicht direkt, siehe
// redeem-pairing-code für den eigentlichen Kopplungs-Trick).
//
// Idempotent: Wird die Funktion für einen Nutzer aufgerufen, der schon eine
// E-Mail hat (z.B. Gerät B, das gerade erst gekoppelt wurde), passiert nichts.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // 'apikey' und 'x-client-info' MÜSSEN mit rein – supabase-js hängt diese Header automatisch
  // an jede Anfrage an (auch an Edge Functions). Fehlten sie hier, blockierte der Browser die
  // eigentliche Anfrage schon beim CORS-Preflight ("Request header field apikey is not allowed
  // by Access-Control-Allow-Headers") – das war die tatsächliche Ursache von
  // "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Client, der im Namen des Aufrufers spricht – nur um zu prüfen, WER anfragt.
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
    const uid = userData.user.id;

    if (userData.user.email) {
      // Bereits bootstrapped (z.B. ein per PIN gekoppeltes Zweitgerät).
      return new Response(JSON.stringify({ ok: true, alreadyBootstrapped: true }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const syntheticEmail = `${uid}@pairing.ducktime.internal`;

    const { error: updateErr } = await admin.auth.admin.updateUserById(uid, {
      email: syntheticEmail,
      email_confirm: true
    });
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, alreadyBootstrapped: false }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});

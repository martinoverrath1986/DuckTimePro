// create-pairing-code
// Von einem BEREITS gekoppelten/eingerichteten Gerät (gültiges JWT) aufgerufen,
// wenn der Nutzer auf "PIN anzeigen" tippt. Erzeugt einen 6-stelligen Code,
// 10 Minuten gültig, einmal verwendbar, gebunden an die eigene user_id.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CODE_TTL_MINUTES = 10;

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

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Kollision mit einem noch aktiven Code vermeiden (selten, aber billig zu prüfen).
    let code = generateCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await admin
        .from('pairing_codes')
        .select('id')
        .eq('code', code)
        .is('used_at', null)
        .maybeSingle();
      if (!existing) break;
      code = generateCode();
    }

    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertErr } = await admin.from('pairing_codes').insert({
      code,
      user_id: userData.user.id,
      expires_at: expiresAt
    });
    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ code, expiresAt }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});

// redeem-pairing-code
// ÖFFENTLICH aufrufbar (kein JWT nötig – das zweite Gerät hat ja noch keine
// Session). Nimmt die vom Nutzer eingetippte PIN entgegen, prüft
// Gültigkeit/Ablauf/Einmalnutzung, markiert den Code sofort als verbraucht und
// gibt einen Magic-Link-Token für die (synthetische) E-Mail des Erstgeräts
// zurück. Der Client ruft damit anschließend supabase.auth.verifyOtp(...) auf
// und bekommt dadurch eine echte Session mit der GLEICHEN auth.uid() wie
// Gerät A – ohne dass irgendwo ein Passwort oder eine sichtbare E-Mail nötig war.
//
// Sicherheits-Kompromiss (bewusst, siehe Plan): 6-stellige Codes + 10 Minuten
// Gültigkeit + Einmalverwendung ist für den Einsatzzweck (1 Person, 2 eigene
// Geräte) angemessen, aber kein Schutz gegen automatisiertes Durchprobieren
// aus dem Internet. Für zusätzliche Härtung ließe sich später ein Rate-Limit
// auf IP-Ebene vor diese Funktion schalten (z.B. via Supabase/Cloudflare).

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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json().catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'PIN fehlt' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: pairing, error: findErr } = await admin
      .from('pairing_codes')
      .select('*')
      .eq('code', code)
      .is('used_at', null)
      .maybeSingle();

    if (findErr || !pairing) {
      return new Response(JSON.stringify({ error: 'Ungültige oder bereits verwendete PIN' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    if (new Date(pairing.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'PIN abgelaufen, bitte neue PIN erzeugen' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    // Sofort als verbraucht markieren (atomarer Single-Use-Schutz: der
    // WHERE-Zusatz used_at is null verhindert doppelte Einlösung bei
    // gleichzeitigen Anfragen).
    const { data: updatedRows, error: usedErr } = await admin
      .from('pairing_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', pairing.id)
      .is('used_at', null)
      .select('id');

    if (usedErr || !updatedRows || updatedRows.length === 0) {
      return new Response(JSON.stringify({ error: 'PIN wurde gerade eben schon verwendet' }), {
        status: 409,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(pairing.user_id);
    if (userErr || !userRes?.user?.email) {
      return new Response(JSON.stringify({ error: 'Konto nicht gefunden' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userRes.user.email
    });
    if (linkErr || !linkData) {
      return new Response(JSON.stringify({ error: linkErr?.message ?? 'Link-Erzeugung fehlgeschlagen' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      email: userRes.user.email,
      token: linkData.properties.hashed_token
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});

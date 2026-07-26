// Echte PIN-Kopplung (löst die simulierte Version aus M1 ab). Zwei Schritte, siehe Plan:
//
// - createPairingCode(): auf dem BEREITS eingerichteten Gerät aufgerufen ("PIN erzeugen").
//   Ruft die Edge Function "create-pairing-code" auf (braucht eine gültige Session – die hat
//   jedes Gerät dank ensureIdentity() in identity.ts spätestens seit dem ersten App-Start).
//
// - redeemPairingCode(): auf dem ZWEITEN Gerät aufgerufen, nachdem der Nutzer die PIN vom
//   ersten Gerät eingetippt hat. Ruft "redeem-pairing-code" auf (kein Login nötig) und bekommt
//   dafür einen Magic-Link-Token zurück. supabase.auth.verifyOtp(...) tauscht die aktuelle
//   (eigene, bis dahin separate) Session gegen eine Session mit der IDENTISCHEN auth.uid() wie
//   Gerät 1 – ab diesem Moment gehören beide Geräte demselben Konto.
//
// Wichtig für M2: Diese Kopplung verbindet nur die KONTEN. Der eigentliche Abgleich von
// Kalendereinträgen/Arbeitgebern/Einstellungen zwischen gekoppelten Geräten kommt erst in
// Meilenstein M3 (Offline-SQLite + Sync-Engine) – bis dahin führt jedes Gerät seine lokalen
// Daten unverändert fort.

import { supabase } from './supabaseClient';
import type { AuthError } from '@supabase/supabase-js';

export interface PairingCode {
  code: string;
  expiresAt: string;
}

// supabase-js liefert bei einem HTTP-Fehler einer Edge Function nur die generische Meldung
// "Edge Function returned a non-2xx status code" in error.message – der eigentliche, hilfreiche
// Text (z.B. "PIN bereits verwendet") steckt im JSON-Body der Response, die unter
// error.context (nur bei Funktions-Fehlern gesetzt) hängt. Diese Hilfsfunktion liest ihn aus.
async function extractFunctionErrorMessage(error: AuthError, fallback: string): Promise<string> {
  try {
    if (error.context) {
      const body = await error.context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    }
  } catch {
    // Response war kein JSON (z.B. reiner Netzwerkfehler) – dann bleibt es beim Fallback.
  }
  return error.message ?? fallback;
}

export async function createPairingCode(): Promise<PairingCode> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht konfiguriert (.env fehlt).');

  const { data, error } = await supabase.functions.invoke<PairingCode>('create-pairing-code');
  if (error || !data) {
    throw new Error(error ? await extractFunctionErrorMessage(error, 'PIN konnte nicht erzeugt werden.') : 'PIN konnte nicht erzeugt werden.');
  }
  return data;
}

export async function redeemPairingCode(code: string): Promise<void> {
  if (!supabase) throw new Error('Cloud-Sync ist nicht konfiguriert (.env fehlt).');

  const { data, error } = await supabase.functions.invoke<{ email: string; token: string }>(
    'redeem-pairing-code',
    { body: { code } }
  );
  if (error || !data) {
    throw new Error(error ? await extractFunctionErrorMessage(error, 'PIN ist ungültig oder abgelaufen.') : 'PIN ist ungültig oder abgelaufen.');
  }

  // WICHTIG: generateLink({type: 'magiclink'}) auf Server-Seite (redeem-pairing-code) erzeugt
  // einen Token, der hier mit type:'email' verifiziert werden muss – NICHT mit 'magiclink'.
  // Das ist ein bekannter Stolperstein der Supabase-Auth-API: 'magiclink' bei verifyOtp ist für
  // einen anderen internen Zweck gedacht und führt bei einem per generateLink erzeugten Token zu
  // "Token has expired or is invalid", obwohl der Token frisch und gültig ist.
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email: data.email,
    token: data.token,
    type: 'email'
  });
  if (verifyErr) {
    throw new Error(verifyErr.message ?? 'Kopplung fehlgeschlagen.');
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

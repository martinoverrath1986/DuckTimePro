// Minimale Ambient-Deklarationen, damit sich das Projekt auch VOR "npm install" typprüfen
// lässt (in dieser Sandbox war der npm-Registry-Zugriff blockiert, siehe Chat-Hinweis).
// Sobald echte Pakete installiert sind, liefern sie ihre eigenen, präziseren Typen mit –
// diese Datei stört dann nicht, wird von den echten Typen einfach überschattet.

declare module '*.css';

declare module 'xlsx' {
  export const utils: {
    json_to_sheet: (data: unknown[]) => unknown;
    book_new: () => unknown;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  export function writeFile(wb: unknown, filename: string): void;
  // Für M5 (Capacitor/Android) genutzt: liefert den Datei-Inhalt als String statt ihn direkt
  // als Browser-Download auszulösen (nötig, weil es in einer Android-WebView keinen normalen
  // Datei-Download gibt – siehe export.ts).
  export function write(wb: unknown, opts: { type: 'base64'; bookType?: string }): string;
}

// Vite liest .env-Variablen normalerweise über eigene Typen (vite/client, per node_modules
// mitgeliefert). Da diese Sandbox ohne npm-Registry-Zugriff auskommt (siehe README), hier eine
// minimale Ambient-Deklaration, überschattet nach "npm install" automatisch von Vites echten
// Typen (gleiches Prinzip wie beim 'xlsx'-Stub oben).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimaler Stub für @supabase/supabase-js – deckt nur ab, was diese App tatsächlich nutzt
// (auth/supabaseClient.ts, auth/identity.ts, auth/pairing.ts). Nach "npm install" liefert das
// echte Paket seine vollständigen, präziseren Typen mit.
declare module '@supabase/supabase-js' {
  export interface AuthError {
    message: string;
    // Nur bei Fehlern von functions.invoke() gesetzt: die rohe Response, damit man den
    // tatsächlichen JSON-Fehlertext der Edge Function auslesen kann (die generische
    // ".message" ist bei HTTP-Fehlern nur "Edge Function returned a non-2xx status code").
    context?: Response;
  }

  export interface User {
    id: string;
    email?: string | null;
  }

  export interface Session {
    access_token: string;
    user: User;
  }

  export interface SupabaseClient {
    auth: {
      getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
      signInAnonymously(): Promise<{ data: { session: Session | null; user: User | null }; error: AuthError | null }>;
      verifyOtp(params: { email: string; token: string; type: string }): Promise<{
        data: { session: Session | null };
        error: AuthError | null;
      }>;
      signOut(): Promise<{ error: AuthError | null }>;
    };
    functions: {
      invoke<T = unknown>(
        name: string,
        opts?: { body?: unknown; headers?: Record<string, string> }
      ): Promise<{ data: T | null; error: AuthError | null }>;
    };
    from<T = Record<string, unknown>>(table: string): PostgrestBuilder<T>;
  }

  export function createClient(
    url: string,
    key: string,
    options?: {
      auth?: { persistSession?: boolean; autoRefreshToken?: boolean };
    }
  ): SupabaseClient;

  // --- Ab hier: Minimaler Stub für supabase.from(table)...  (Sync-Engine, M3) ---
  // Bildet nur die Kette ab, die sync/engine.ts tatsächlich benutzt (select/upsert/eq/gt/order).
  // Das echte postgrest-js ist deutlich generischer typisiert; reicht hier nicht, wird aber
  // nach "npm install" ohnehin von den echten Typen überschattet.
  export interface PostgrestError {
    message: string;
  }

  export interface PostgrestResponse<T> {
    data: T[] | null;
    error: PostgrestError | null;
  }

  export interface PostgrestBuilder<T> extends PromiseLike<PostgrestResponse<T>> {
    select(columns?: string): PostgrestBuilder<T>;
    eq(column: string, value: unknown): PostgrestBuilder<T>;
    gt(column: string, value: unknown): PostgrestBuilder<T>;
    gte(column: string, value: unknown): PostgrestBuilder<T>;
    order(column: string, opts?: { ascending?: boolean }): PostgrestBuilder<T>;
    upsert(values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }): PostgrestBuilder<T>;
  }
}

// Minimaler Stub für sql.js (WASM-SQLite, storage/sqlite/db.ts + sqliteAdapter.ts). Bildet die
// seit Jahren stabile sql.js-API ab. Nach "npm install" liefert das echte Paket seine eigenen,
// vollständigeren Typen mit.
declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: (string | number | Uint8Array | null)[][];
  }

  export class Statement {
    bind(params?: (string | number | null)[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }

  export class Database {
    constructor(data?: Uint8Array | null);
    run(sql: string, params?: (string | number | null)[]): Database;
    exec(sql: string, params?: (string | number | null)[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}

// Vite-Konvention für Asset-Imports als URL-String (hier: der sql.js-WASM-Binärpfad).
declare module '*.wasm?url' {
  const url: string;
  export default url;
}

// --- Ab hier: Minimale Stubs für Capacitor (Meilenstein M5, Android-Hülle in apps/mobile).
// Decken jeweils nur ab, was export.ts tatsächlich benutzt. Nach "npm install" liefern die
// echten Pakete ihre vollständigeren Typen mit (gleiches Prinzip wie bei den Stubs oben).
declare module '@capacitor/core' {
  export const Capacitor: {
    isNativePlatform(): boolean;
    getPlatform(): string;
  };
}

declare module '@capacitor/filesystem' {
  export enum Directory {
    Cache = 'CACHE',
    Documents = 'DOCUMENTS',
    Data = 'DATA',
    External = 'EXTERNAL',
    ExternalStorage = 'EXTERNAL_STORAGE'
  }
  export interface WriteFileResult {
    uri: string;
  }
  export const Filesystem: {
    writeFile(options: {
      path: string;
      data: string;
      directory?: Directory;
      encoding?: string;
    }): Promise<WriteFileResult>;
  };
}

declare module '@capacitor/share' {
  export interface ShareResult {
    activityType?: string;
  }
  export const Share: {
    share(options: {
      title?: string;
      text?: string;
      url?: string;
      dialogTitle?: string;
    }): Promise<ShareResult>;
  };
}

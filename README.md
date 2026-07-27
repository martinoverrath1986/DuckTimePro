# DuckTime Pro – Meilenstein M1 (Vite-Migration)

Dieses Verzeichnis (`apps/web`) enthält den aus der Browser-Vorschau (`DuckTimePro_Vorschau.html`)
migrierten, modularen Web-Code – funktional identisch, aber jetzt als richtiges Vite/TypeScript-
Projekt statt einer einzigen HTML-Datei mit CDN-Skripten. Dies ist die gemeinsame Basis, die ab
Meilenstein M4/M5 per **Tauri** (Windows) und **Capacitor** (Android) als native App verpackt wird.

## Wichtiger Hinweis zur Entstehung

Diese Dateien wurden in einer Cloud-Sandbox ohne Zugriff auf die npm-Registry erstellt
(`registry.npmjs.org` war dort netzwerkseitig blockiert – `npm install` war deshalb nicht möglich).
Verifiziert wurde stattdessen:

1. **Typprüfung** (`tsc --noEmit`) – lief fehlerfrei durch alle Module.
2. **Eigenständiger Logik-Test** (`src/calc.test.ts`, ausführbar mit `npx tsx src/calc.test.ts`)
   – prüft exakt die Werte, die zuvor per Playwright gegen den Browser-Prototyp verifiziert wurden
   (z.B. Hauptjob 8h à 16€/h = 128€, Minijob-Überschneidungswarnung, eingefrorener Lohn-Schnappschuss).

Ein echter `npm install` + `npm run dev`/`npm run build` (inkl. Tailwind-Kompilierung, Bundle-Test,
Offline-Test) steht noch aus und sollte **auf einem Rechner mit Internetzugang** (z.B. diesem Mac)
einmal ausgeführt werden, bevor es zu M2 (Supabase) weitergeht.

## Erste Schritte

```bash
cd apps/web
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run test       # Logik-Tests (calc.ts)
npm run typecheck  # TypeScript-Prüfung
npm run build      # Produktions-Build nach dist/ (für Tauri/Capacitor)
```

Nach `npm run build` sollte `dist/index.html` sich auch **mit ausgeschaltetem WLAN** öffnen lassen
und identisch zur bisherigen Browser-Vorschau funktionieren (Kalender, Arbeitgeber, Statistiken,
Excel-Export) – das ist das Abnahmekriterium für M1 laut Plan.

### Wichtig: `dist/index.html` NICHT per Doppelklick testen

Browser blockieren `<script type="module">` grundsätzlich, wenn eine Seite direkt als lokale Datei
(`file://...`, z.B. per Doppelklick/„Öffnen mit Browser“) geladen wird – das ist keine Eigenheit
dieses Projekts, sondern eine feste Sicherheitsregel jedes Browsers (Chrome, Safari). Das äußert
sich als leere Seite bzw. Kalender ohne Funktion, obwohl das CSS meist noch geladen wird.

Für den Offline-Test deshalb **immer über einen lokalen Server öffnen** (funktioniert komplett
ohne Internet – der Server läuft nur auf dem eigenen Rechner):

```bash
cd dist
python3 -m http.server 5555
# dann im Browser: http://localhost:5555
```

WLAN kann dabei ausgeschaltet bleiben. Das entspricht auch dem späteren Verhalten in der echten
App: Tauri (`tauri://localhost`) und Capacitor (`https://localhost`) laden die Seite ebenfalls
über eine lokale Adresse, nicht über `file://` – das Doppelklick-Problem betrifft also nur diesen
manuellen Zwischentest, nicht die fertige Windows-/Android-App.

## Projektstruktur

```
apps/web/
  index.html              # Markup (1:1 aus der getesteten Vorschau, nur Skript-Einbindung geändert)
  src/
    main.ts                # Einstiegspunkt, verdrahtet alle Module
    types.ts                # Employer/Entry/Settings-Typen (inkl. Sync-Felder für M2/M3)
    calc.ts                 # Reine Rechenfunktionen (Stunden, Verdienst, Überstunden, Überschneidung)
    calc.test.ts             # Eigenständiger Logik-Test (ohne Browser, per tsx ausführbar)
    state.ts                 # App-State + Anbindung an StorageAdapter
    storage/adapter.ts        # StorageAdapter-Interface (zentrale Abstraktion für M3 Offline-SQLite)
    storage/localStorageAdapter.ts  # M1-Implementierung (localStorage)
    calendar.ts, dayModal.ts, entries.ts, employers.ts, stats.ts, export.ts, sync.ts,
    settingsModal.ts, infoModal.ts  # UI-Module, je Tab/Modal eines
```

## Nächste Meilensteine (siehe Plan)

- **M2:** Supabase-Schema + PIN-Kopplung – siehe Abschnitt unten (abgeschlossen, End-to-End getestet)
- **M3:** Offline-SQLite + echte Sync-Engine – siehe Abschnitt unten (abgeschlossen, End-to-End getestet)
- **M4:** Tauri-Windows-Paket + GitHub-Actions-Build – siehe Abschnitt unten (abgeschlossen, End-to-End getestet)
- **M5 (aktueller Stand):** Capacitor-Android-Paket – siehe Abschnitt unten
- **M6:** Politur, Tests, Geräte-Verwaltung

## Meilenstein M2 – Supabase-Schema + PIN-Kopplung

Schema (`supabase/migrations/0001_init.sql`, `0002_pairing.sql`) und die drei Edge Functions
(`supabase/functions/*`) sind im Supabase-Projekt bereits eingerichtet. Neu im Web-Code:

- `src/auth/supabaseClient.ts` – zentraler Supabase-Client (nur `anon`-Key, niemals der
  `service_role`-Key)
- `src/auth/identity.ts` – `ensureIdentity()`: meldet jedes Gerät beim Start automatisch anonym an
  und ruft einmalig die Edge Function `bootstrap-identity` auf (läuft unsichtbar im Hintergrund,
  kein Login-Bildschirm nötig)
- `src/auth/pairing.ts` – `createPairingCode()` / `redeemPairingCode()`: echte PIN-Kopplung über
  `create-pairing-code` / `redeem-pairing-code`
- `src/sync.ts` – UI-Logik für den Sync-Tab (PIN anzeigen mit Countdown, PIN eingeben)

**Wichtig, bevor `npm install`/`npm run dev` funktioniert:** In `apps/web/.env.example` steht
bereits die Projekt-URL. Datei nach `apps/web/.env` kopieren und `VITE_SUPABASE_ANON_KEY` mit dem
**"anon public"-Key** aus Supabase Project Settings -> API füllen (NICHT den `service_role`-Key –
der darf nur serverseitig in den Edge Functions stehen, nie im Client-Code).

**Was M2 bewusst NICHT enthält:** Ein Gerät koppeln bedeutet nur, dass beide Geräte fortan
dieselbe Cloud-Identität (`auth.uid()`) teilen. Kalendereinträge, Arbeitgeber und Einstellungen
werden noch **nicht** zwischen Geräten abgeglichen – das ist Meilenstein M3, für den das
`StorageAdapter`-Interface (`getDirtyRows`/`markSynced`/`applyRemoteRows`) schon vorbereitet ist.

**Update:** End-to-End auf einem Mac mit zwei Browser-Profilen getestet und erfolgreich gekoppelt
(gleiche `auth.uid()` auf beiden Geräten). Unterwegs aufgetretene und behobene Stolperfallen
(zur Erinnerung, falls sowas nochmal auftaucht):
- Supabase-CORS-Preflight blockiert durch "Enforce JWT Verification" (musste für alle drei
  Edge Functions aus sein – die Functions prüfen den Nutzer ohnehin selbst im Code)
- Fehlender `apikey`-Header in `Access-Control-Allow-Headers` (supabase-js hängt ihn automatisch
  an jede Anfrage an)
- `verifyOtp` muss mit `type: 'email'` aufgerufen werden, nicht `type: 'magiclink'` (auch wenn
  serverseitig `generateLink({type: 'magiclink'})` verwendet wird)
- Port-Kollision: ein anderes, parallel laufendes Projekt belegte ebenfalls Port 5173 – DuckTime
  läuft seitdem fest auf Port 5314 (`vite.config.ts`)
- `.env` muss wirklich als Datei existieren (nicht nur `.env.example`) – Vite liest sie nur beim
  Start des Dev-Servers ein, ein bloßes Neuladen der Seite reicht nicht

## Meilenstein M3 – Offline-SQLite + echte Sync-Engine

Zwei Bausteine, beide jetzt umgesetzt:

**1. Offline-SQLite statt localStorage.** Neuer Standard-Storage-Adapter `src/storage/sqliteAdapter.ts`
nutzt [sql.js](https://github.com/sql-js/sql.js) (SQLite als WASM, läuft direkt im Browser) statt
`localStorage`. Die Datenbank selbst existiert nur im Arbeitsspeicher; nach jeder Änderung wird ein
kompletter Snapshot in IndexedDB gesichert und beim nächsten App-Start wieder geladen
(`src/storage/sqlite/db.ts`). Grund für SQLite statt localStorage: echte Transaktionen, kein
5-10 MB-Limit, und strukturell dieselbe Basis wie später bei Tauri/Capacitor (M4/M5 tauschen dort
nur noch den Persistenz-Mechanismus, IndexedDB → echtes Dateisystem, aus – die SQL-Logik bleibt).

Bereits vorhandene Daten aus M1/M2 (localStorage) werden beim ersten Start **einmalig automatisch
übernommen** (`migrateFromLocalStorage()` in `sqliteAdapter.ts`) – IDs, die keine echten UUIDs sind
(alte `Date.now()`-basierte IDs), werden dabei durch frische UUIDs ersetzt, das ist Voraussetzung
für den Sync (Supabase erwartet `uuid`-Spalten). Neue Einträge/Arbeitgeber nutzen jetzt direkt
`crypto.randomUUID()` (`src/employers.ts`, `src/entries.ts`) statt `Date.now().toString()`.

**2. Echte Sync-Engine** (`src/syncEngine/`):
- `mapping.ts` – übersetzt zwischen den lokalen camelCase-Typen und den Supabase-Zeilen
  (snake_case). `updated_at` und `user_id` werden beim Hochladen bewusst NICHT mitgeschickt – der
  Server setzt beides automatisch (Trigger bzw. Spalten-Default `auth.uid()`), das ist die
  Grundlage der Konfliktlösung (siehe unten).
- `engine.ts` – `runSync()`: pusht erst alle lokal geänderten ("dirty") Zeilen zu Supabase, pullt
  danach alles, was seit dem letzten Sync neu/geändert ist (eigene, gerade gepushte Zeilen UND
  Änderungen von einem gekoppelten anderen Gerät).

**Konfliktlösung:** Last-Write-Wins über den serverseitig gesetzten `updated_at`-Zeitstempel. Ist
eine lokale Zeile beim Pull noch "dirty" (eigene, noch nicht hochgeladene Änderung), wird sie
NICHT überschrieben (`applyRemoteRows()` in `sqliteAdapter.ts`) – sie wird beim nächsten Push
hochgeladen und erst danach normal abgeglichen. Das verhindert, dass ein Pull mitten in einer
laufenden lokalen Bearbeitung Daten verwirft.

**Wann wird synchronisiert:**
- Automatisch beim App-Start (falls Cloud-Identität vorhanden, siehe `main.ts`)
- Automatisch direkt nach einer erfolgreichen PIN-Kopplung (`sync.ts`)
- Manuell jederzeit über den Button "Jetzt synchronisieren" im Sync-Tab

Bewusst NICHT umgesetzt: kontinuierliches Hintergrund-Polling (unnötiger Akku-/Datenverbrauch für
eine persönliche Zeiterfassung mit zwei Geräten) – die drei Auslöser oben reichen für den
Anwendungsfall.

**Keine neuen Supabase-Dashboard-Schritte nötig** – Schema und RLS-Policies aus M2
(`0001_init.sql`) waren von Anfang an für den Sync ausgelegt. Nur `npm install` (neue Abhängigkeit
`sql.js`) und `npm run dev` sind nötig.

**Nicht in der Sandbox testbar:** Wie bei M1/M2 kein Netzwerkzugriff auf Supabase in dieser
Cloud-Sandbox. Verifiziert wurde: `tsc --noEmit` (fehlerfrei), der bestehende Logik-Test
(weiterhin grün), und alle SQL-Statements des neuen SQLite-Schemas + der Upsert/Conflict-Queries
gegen eine echte SQLite-Datenbank (Python `sqlite3`-Modul, identischer SQL-Dialekt wie sql.js).
Der komplette End-to-End-Test (zwei Geräte, echte Einträge anlegen, synchronisieren, Konflikt
erzeugen) steht auf einem Rechner mit Internetzugang noch aus.

## Meilenstein M4 – Tauri-Windows-Paket + GitHub-Actions-Build

Neu: `apps/desktop/` – eine [Tauri v2](https://v2.tauri.app)-Hülle, die den unveränderten Web-Code
aus `apps/web` als natives Windows-Fenster verpackt (`.msi`- und `.exe`(NSIS)-Installer). Da
Cross-Compiling für Windows von einem Mac aus nicht praktikabel ist, baut eine **GitHub-Actions-
Pipeline** die echte `.msi`/`.exe` auf einem echten `windows-latest`-Runner – das war die von dir
gewählte Option ("GitHub Actions einrichten").

**Wichtige Vereinfachung gegenüber dem ursprünglichen Plan:** Der Plan sah für M4/M5 ein natives
SQLite-Plugin (`@tauri-apps/plugin-sql`) vor. Das ist jetzt **nicht mehr nötig** – die in M3 gebaute
Lösung (sql.js/WASM-SQLite direkt im WebView + IndexedDB-Persistenz) läuft unverändert auch in
Tauris WebView weiter, da Tauri letztlich auch nur eine WebView ist. Dadurch entfällt die in
`capabilities/` sonst nötige Plugin-Konfiguration; es reicht das Standard-`core:default`.

### Neue Dateien
```
apps/desktop/
  package.json                 # enthält nur die Tauri-CLI als devDependency
  src-tauri/
    Cargo.toml                 # Rust-Paketdefinition, Release-Profil auf kleine Dateigröße getrimmt
    build.rs                   # Standard-Tauri-Build-Hook
    src/main.rs                # bewusst minimal – keine eigene Rust-Logik nötig
    tauri.conf.json             # Fenstergröße, CSP, Bundle-Targets (msi + nsis), Icon-Liste
    capabilities/default.json   # Rechte des Hauptfensters (nur core:default)
    icons/                      # 32x32.png, 128x128.png, 128x128@2x.png, icon.png, icon.ico, icon.icns
.github/workflows/windows-build.yml  # baut bei jedem Push nach "main" automatisch
```

Die Icons wurden programmatisch erzeugt (passend zum bestehenden Enten-Design aus `pwa.ts`: gelber
Körper, oranger Schnabel, pinke/violette Federn) – kein manuelles Icon-Design nötig.

`tauri.conf.json` zeigt per `beforeDevCommand`/`beforeBuildCommand` auf `apps/web` (`npm run dev` /
`npm run build`) und lädt danach `../../web/dist`. Die Content-Security-Policy erlaubt explizit
`https://*.supabase.co` + `wss://*.supabase.co` (sonst würde Sync im fertigen Release lautlos
fehlschlagen – ein im Ursprungsplan benanntes Risiko) sowie `'wasm-unsafe-eval'` (nötig, damit
sql.js sein WASM-Modul laden darf).

### Was in dieser Sandbox verifiziert wurde – und was nicht

Wie schon bei M1–M3: diese Cloud-Sandbox hat **keinen Netzwerkzugriff** auf `crates.io` (Rust-Paket-
Registry), `registry.npmjs.org` oder GitHub – ein `cargo build`/`npm install`/echter `tauri build`
war hier technisch nicht möglich. Verifiziert wurde stattdessen:
- `tauri.conf.json`, `capabilities/default.json`, `package.json` → gültiges JSON
- `Cargo.toml` → gültiges TOML
- `.github/workflows/windows-build.yml` → gültiges YAML
- Alle Icon-Dateien → mit Pillow erfolgreich neu eingelesen (u.a. `icon.ico` mit allen 7 erwarteten
  Auflösungen 16–256px, `icon.icns` mit 1024px)

Der eigentliche Rust-/Tauri-Build läuft zum ersten Mal auf dem GitHub-Actions-Runner – das ist damit
gleichzeitig der erste echte Test dieser Konfiguration.

### Einrichtung (auf deinem Mac, im Terminal)

**1. Git-Repository anlegen** (existiert bisher noch nicht):
```bash
cd "/Users/martinoverrath/Desktop/KI Projekte/DuckTimePro/ducktime-pro"
git init
git add .
git commit -m "DuckTime Pro: M1-M4 (Vite, Supabase-Sync, PIN-Kopplung, Tauri-Windows-Build)"
```

**2. GitHub-Repository erstellen** (leer, ohne README/Lizenz, damit es nicht mit dem lokalen `git
init` kollidiert) – entweder auf https://github.com/new im Browser, oder falls die `gh`-CLI
installiert ist (`brew install gh` + `gh auth login`):
```bash
gh repo create ducktime-pro --private --source=. --remote=origin
```
Bei manueller Erstellung über die Website danach:
```bash
git remote add origin https://github.com/<dein-github-name>/ducktime-pro.git
```

**3. Zwei Secrets im Repo hinterlegen** (GitHub → Repo → Settings → Secrets and variables →
Actions → "New repository secret"), damit der Web-Build sich mit Supabase verbinden kann:
- `VITE_SUPABASE_URL` → dieselbe URL wie in deiner lokalen `apps/web/.env`
- `VITE_SUPABASE_ANON_KEY` → derselbe **anon public**-Key (niemals der `service_role`-Key!)

**4. Pushen – das startet den ersten Build automatisch:**
```bash
git branch -M main
git push -u origin main
```

### Build abholen

GitHub → Repo → Tab **"Actions"** → den Lauf "Windows-Build (Tauri)" anklicken (dauert beim ersten
Mal ca. 10–15 Minuten, weil Rust-Abhängigkeiten kalt kompiliert werden müssen – spätere Läufe sind
dank `Swatinem/rust-cache` deutlich schneller) → ganz unten im Lauf-Bericht Abschnitt
**"Artifacts"** → `DuckTime-Pro-Windows` herunterladen (ZIP mit `.msi`- und `.exe`-Installer) →
auf einem Windows-Rechner entpacken und installieren.

Manuell auslösen (ohne neuen Commit) geht jederzeit über Actions → "Windows-Build (Tauri)" →
"Run workflow".

### Lokal entwickeln (optional, auf jedem Rechner mit Rust)

```bash
# einmalig: Rust-Toolchain installieren, falls noch nicht vorhanden: https://rustup.rs
cd apps/desktop
npm install
npm run tauri dev     # startet die App als natives Fenster (auf dem Mac: macOS-Fenster,
                       # funktional identisch – für die echte Windows-.msi siehe GitHub Actions oben)
```

### Offene Punkte für später (nicht Teil von M4)

- Code-Signing für die `.msi` (ohne Zertifikat zeigt Windows beim Erstinstall eine
  SmartScreen-Warnung – für eine private App unkritisch, aber erwähnenswert)
- Auto-Updates (Tauris Updater-Plugin) – aktuell muss jede neue Version manuell neu heruntergeladen
  und installiert werden
- Automatische GitHub-Releases statt reiner Workflow-Artefakte (ließe sich später leicht ergänzen,
  z.B. mit `tauri-apps/tauri-action`)

## Meilenstein M5 – Capacitor-Android-Paket

Neu: `apps/mobile/` – eine [Capacitor](https://capacitorjs.com) 8-Hülle, die denselben
unveränderten Web-Code aus `apps/web` als Android-App verpackt (`.apk`). Analog zu M4 baut eine
**GitHub-Actions-Pipeline** (`.github/workflows/android-build.yml`) die `.apk` automatisch bei
jedem Push – auf einem Linux-Runner mit vorinstalliertem Android-SDK, kein Android Studio auf
deinem Mac nötig.

**Dieselbe Vereinfachung wie bei M4:** Der ursprüngliche Plan sah für Android ein natives
SQLite-Plugin (`@capacitor-community/sqlite`) vor. Auch das ist **nicht nötig** – die
sql.js/WASM-Lösung aus M3 läuft unverändert auch in Capacitors Android-WebView weiter.

**Was für Android tatsächlich angepasst werden musste:** der Excel-/Backup-Export. Ein normaler
Browser-Download (wie er im Web und in der Tauri-App funktioniert) gibt es in einer
Android-WebView nicht. `src/export.ts` unterscheidet deshalb jetzt per
`Capacitor.isNativePlatform()`:
- **Web/Tauri (unverändert):** `XLSX.writeFile()` bzw. Blob-Download wie bisher.
- **Android (neu):** Datei wird ins App-Cache-Verzeichnis geschrieben
  (`@capacitor/filesystem`) und über den nativen Android-**Teilen**-Dialog angeboten
  (`@capacitor/share`) – der Nutzer wählt dort z.B. "In Dateien speichern", "Per E-Mail senden"
  oder eine Cloud-App. `importJSON()` (Backup einlesen) brauchte keine Änderung – der normale
  `<input type="file">`-Dateiauswahldialog funktioniert in der Android-WebView bereits von Haus aus.

### Neue/geänderte Dateien
```
apps/mobile/
  package.json              # @capacitor/core, @capacitor/android, @capacitor/cli
  capacitor.config.ts        # appId, webDir -> ../web/dist
  android/                   # WIRD ERST DURCH DICH ERZEUGT, siehe "Einrichtung" unten –
                              # existiert in diesem Lieferumfang noch NICHT
.github/workflows/android-build.yml  # baut die .apk bei jedem Push nach "main"
apps/web/src/export.ts       # Android-Zweig für Excel-/JSON-Export (siehe oben)
apps/web/src/shims.d.ts       # Typ-Stubs für @capacitor/core, /filesystem, /share
apps/web/package.json        # neue Abhängigkeiten: @capacitor/core, /filesystem, /share
```

### Wichtig: einen Schritt musst du selbst ausführen

Anders als bei M4 kann ich das native Android-Projekt (`apps/mobile/android/`) **nicht selbst
erzeugen** – das braucht die Capacitor-CLI mit echtem `npm install` (Netzwerk auf `npm` und das
Android-SDK sind in meiner Cloud-Sandbox beide nicht erreichbar, wie schon bei M1–M4). Das ist ein
einmaliger Schritt bei dir im Terminal:

```bash
cd "/Users/martinoverrath/Desktop/KI Projekte/DuckTimePro/ducktime-pro/apps/mobile"
npm install
npx cap add android
```

Das erzeugt den Ordner `apps/mobile/android/` (ein vollständiges Android-Studio-Projekt inkl.
`gradlew`). Danach ganz normal committen und pushen:

```bash
cd "/Users/martinoverrath/Desktop/KI Projekte/DuckTimePro/ducktime-pro"
git add apps/mobile
git commit -m "M5: Capacitor-Android-Projekt hinzugefügt"
git push
```

Der Push startet automatisch den Actions-Lauf "Android-Build (Capacitor)" – die zwei Secrets
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sind ja aus M4 schon hinterlegt, dafür ist nichts
Neues nötig.

### Build abholen

GitHub → Repo → Tab **"Actions"** → Lauf **"Android-Build (Capacitor)"** anklicken → unten
**"Artifacts"** → `DuckTime-Pro-Android` herunterladen (ZIP mit der `.apk` drin).

**Auf dem Android-Handy installieren:**
1. Die `.apk` aufs Handy übertragen (z.B. per E-Mail an dich selbst, Google Drive, USB-Kabel, o.ä.)
2. Auf die `.apk`-Datei tippen → Android fragt vermutlich nach der Berechtigung **"Apps aus
   unbekannten Quellen installieren"** für die App, mit der du die Datei öffnest (z.B. "Dateien"
   oder Gmail) – das ist normal, da es kein Play-Store-Download ist (privates Sideloading)
3. Installieren, App öffnen

Das ist ein **Debug-Build** (unsigniert bzw. mit Gradles automatischem Debug-Schlüssel signiert) –
für privates Sideloading auf dem eigenen Handy völlig ausreichend, entspricht der unsignierten
`.msi` bei Windows (SmartScreen-Warnung dort = vergleichbare Android-Warnung hier).

### Zum vollständigen Abnahmetest von M5 (laut Plan)

- App installieren, öffnen → Kalender wird angezeigt
- Über den Sync-Tab mit deiner bestehenden Cloud-Identität **per PIN koppeln** (genau wie bei den
  Browser-Profilen in M2 bzw. der Windows-App in M4)
- Flugmodus an, einen Eintrag anlegen, Flugmodus aus, synchronisieren → Eintrag sollte auf den
  anderen gekoppelten Geräten auftauchen
- Excel-Export testen → Android-Teilen-Dialog sollte erscheinen

### Was in dieser Sandbox verifiziert wurde – und was nicht

Wie immer: kein Netzwerkzugriff auf `npm`/Android-SDK/GitHub in dieser Cloud-Sandbox, daher kein
echter `npm install`/`npx cap add android`/Gradle-Build hier möglich. Verifiziert wurde:
- `package.json` (apps/mobile, apps/web) → gültiges JSON
- `android-build.yml` → gültiges YAML
- `export.ts`/`shims.d.ts` → `tsc --noEmit` läuft weiterhin fehlerfrei durch

Der native Android-Build läuft zum ersten Mal auf dem GitHub-Actions-Runner, sobald du
`apps/mobile/android/` erzeugt und gepusht hast – das ist damit auch hier der erste echte Test.

### Offene Punkte für später (nicht Teil von M5)

- Signierter Release-Build + Play-Store-Veröffentlichung (laut Plan für rein private Nutzung
  bewusst nicht nötig – Sideloading reicht)
- App-Icon für Android (aktuell Capacitors Standard-Icon; ließe sich mit denselben
  Enten-PNGs aus `apps/desktop/src-tauri/icons/` per `npx capacitor-assets generate` erzeugen)
- Push-Benachrichtigungen bei Sync von einem anderen Gerät (nicht Teil des ursprünglichen Plans)

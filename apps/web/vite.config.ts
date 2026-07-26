import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Projekt-Root EXPLIZIT von der Position dieser Datei ableiten (nicht implizit von
// process.cwd()). Grund: bei manchen Terminal-/Shell-Setups wich der von Vite intern
// verwendete Arbeitsordner-Pfad vom tatsächlichen Ordner ab (sichtbar am Build-Fehler
// "Could not resolve entry module '#/index.html'"), z. B. wenn eine Shell-Prompt-Erweiterung
// oder ein Copy-Paste ein Sonderzeichen an den Pfad anhängt. Ein absoluter, aus der Datei
// selbst abgeleiteter Pfad ist davon unabhängig und daher robuster.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite hängt an <script type="module"> und <link rel="stylesheet"> standardmäßig ein
// "crossorigin"-Attribut an. Das hilft bei manchen Browsern (z.B. Chrome) beim
// Öffnen per Doppelklick (file://) zusätzlich, unabhängig davon aber gilt: ES-Module
// ("type=module") lässt kein Browser über file:// laden (harte, eingebaute Beschränkung,
// siehe README-Hinweis "Lokal testen"). WICHTIG: order:'post' ist nötig, weil Vites
// eigenes HTML-Build-Plugin das crossorigin-Attribut erst NACH den regulären Plugins
// einfügt – ohne 'post' läuft dieser Schritt zu früh und bewirkt nichts (so geschehen
// im ersten Anlauf: das Attribut blieb trotz dieses Plugins im Build erhalten).
function stripCrossorigin() {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        return html.replace(/ crossorigin/g, '');
      }
    }
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [stripCrossorigin()],
  // Relative statt absolute Pfade – wichtig, damit die gebauten Dateien später korrekt
  // innerhalb der Tauri-/Capacitor-Hülle geladen werden (kein echter Webserver-Root).
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    // Bewusst NICHT der Vite-Standardport 5173 – der kollidierte auf diesem Rechner mit einem
    // anderen, parallel laufenden Projekt (React + vite-plugin-pwa), was zu verwirrenden
    // Fehlern führte (Requests landeten teils beim falschen Dev-Server). strictPort sorgt
    // zusätzlich dafür, dass Vite bei einer erneuten Kollision klar abbricht statt still auf
    // einen anderen Port auszuweichen.
    port: 5314,
    strictPort: true
  }
});

// 1:1 aus dem Prototyp übernommen: registriert einen No-Op-Service-Worker und ein dynamisches
// Web-App-Manifest, damit die Seite im Browser (M1/M2/M3-Testphase vor den nativen Hüllen)
// als PWA installierbar ist. Für die spätere Tauri-/Capacitor-Verpackung ohne Bedeutung,
// stört dort aber auch nicht.
export function registerPwaAssets(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swCode = `self.addEventListener('fetch', (e) => {});`;
      const blob = new Blob([swCode], { type: 'text/javascript' });
      navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
    });
  }

  const manifestData = {
    name: 'DuckTime',
    short_name: 'DuckTime',
    start_url: './index.html',
    display: 'standalone',
    background_color: '#fefce8',
    theme_color: '#eab308',
    icons: [
      {
        src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='14' r='6' fill='%23facc15'/><path d='M16 14h4l-2 3h-3z' fill='%23f97316'/><circle cx='13.5' cy='12.5' r='1' fill='%231e293b'/><path d='M10 7L11 3h2l1 4-2 1z' fill='%23ec4899'/><path d='M12 5l1-3h1l1 3-2 1z' fill='%238b5cf6'/></svg>",
        sizes: '192x192',
        type: 'image/svg+xml'
      }
    ]
  };
  const manifestBlob = new Blob([JSON.stringify(manifestData)], { type: 'application/manifest+json' });
  const manifestLink = document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = URL.createObjectURL(manifestBlob);
  document.head.appendChild(manifestLink);
}

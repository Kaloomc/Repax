#!/usr/bin/env node
// Exporte les icônes PNG depuis les SVG de public/icons/ (hors appli : rien à installer pour la faire tourner).
// Utilise un Chrome « headless » déjà présent (variable CHROME, sinon Playwright, Chromium ou Chrome du système).
//   node scripts/icones.js            → icon-192 et icon-512 (coins arrondis, transparents), icon-maskable-512 et apple-touch-icon (180)
//                                       (carrés pleins : le système arrondit lui-même), favicon-32 (carré plein)
//   node scripts/icones.js --apercu   → en plus, docs/logo-apercu.png (avant / après, 192 / 60 / 40 px, fond clair et sombre)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const racine = path.join(__dirname, '..');
const icones = path.join(racine, 'public', 'icons');

function trouverChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const pw = path.join(os.homedir(), '.cache', 'ms-playwright');
  const candidats = [];
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw)) {
      if (!d.startsWith('chromium_headless_shell')) continue; // le Chrome complet de Playwright ne rend pas sans écran
      for (const sous of fs.readdirSync(path.join(pw, d))) candidats.push(path.join(pw, d, sous, 'chrome-headless-shell'));
    }
  }
  candidats.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  const trouve = candidats.find((c) => fs.existsSync(c));
  if (!trouve) throw new Error('Aucun Chrome trouvé : définis CHROME=/chemin/vers/chrome');
  return trouve;
}

// Photographie une page HTML à la taille voulue (fond transparent si `transparent`).
function photographier(html, sortie, largeur, hauteur, transparent = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icones-'));
  const page = path.join(tmp, 'page.html');
  fs.writeFileSync(page, html);
  execFileSync(trouverChrome(), [
    '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--default-background-color=${transparent ? '00000000' : 'ffffffff'}`,
    `--window-size=${largeur},${hauteur}`, `--screenshot=${sortie}`, `file://${page}`,
  ], { stdio: 'ignore', timeout: 30000 });
  fs.rmSync(tmp, { recursive: true });
}

const image = (svg, t) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block}</style><img src="file://${path.join(icones, svg)}" width="${t}" height="${t}">`;
const exporter = (svg, png, t, transparent = false) => photographier(image(svg, t), path.join(icones, png), t, t, transparent);

exporter('icon.svg', 'icon-512.png', 512, true);
exporter('icon.svg', 'icon-192.png', 192, true);
exporter('icon-carre.svg', 'apple-touch-icon.png', 180); // iOS arrondit lui-même : carré plein, sans transparence
exporter('icon-maskable.svg', 'icon-maskable-512.png', 512);
exporter('favicon.svg', 'favicon-32.png', 32);
console.log('Icônes exportées dans public/icons/');

if (process.argv.includes('--apercu')) {
  const avant = path.join(racine, 'docs', 'logo-avant.png');
  const apres = path.join(icones, 'icon-512.png');
  const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const ligne = (src) => [192, 60, 40].map((t) => `<img src="${src}" width="${t}" height="${t}" style="border-radius:${Math.round(t * 0.223)}px">`).join('');
  const bloc = (titre, src) => `<div class="b"><h3>${titre}</h3><div class="fond clair">${ligne(src)}</div><div class="fond sombre">${ligne(src)}</div></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px;background:#e9ecea;font:600 16px system-ui,sans-serif;color:#1d2420;width:1000px}
    h2{margin:0 0 18px;font-size:22px} h3{margin:0 0 10px;font-size:15px;color:#55605a}
    .ligne{display:flex;gap:28px}.b{flex:1}
    .fond{display:flex;align-items:flex-end;gap:18px;padding:18px;border-radius:16px;margin-bottom:12px}
    .clair{background:#f7f9f7}.sombre{background:#000}
  </style><h2>Repax : logo avant / après (192, 60 et 40 px, fond clair et sombre)</h2>
  <div class="ligne">${bloc('Avant', b64(avant))}${bloc('Après', b64(apres))}</div>`;
  photographier(html, path.join(racine, 'docs', 'logo-apercu.png'), 1056, 600);
  console.log('Planche : docs/logo-apercu.png');
}

// Servidor local sin dependencias para Test_NoMansSky.
// - Sirve los archivos de esta carpeta (index.html, img/...).
// - /api/mision-comunitaria hace de intermediario con la API de la comunidad
//   (api.nmsassistant.com), porque esa API no permite consultas directas desde el navegador (CORS).
// Uso:  node server.js   ->   http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const UPSTREAM = 'https://api.nmsassistant.com/HelloGames/CommunityMission';
const CACHE_MS = 60 * 1000; // no molestamos a la API más de 1 vez por minuto

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let cache = { at: 0, data: null };

async function getMission() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const res = await fetch(UPSTREAM, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('La API respondió ' + res.status);
  const data = await res.json();
  cache = { at: Date.now(), data };
  return data;
}

// Galería SVS: cada carpeta dentro de img/Players es un jugador; cada imagen dentro, una captura.
// Se lee en cada petición, así que basta con copiar imágenes nuevas a la carpeta (sin tocar el código).
const PLAYERS_DIR = path.join(ROOT, 'img', 'Players');
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

// captions.json: explicación de cada captura, con la clave "Jugador/archivo.png" -> { title, text }.
// Las capturas sin entrada simplemente se muestran sin explicación.
function loadCaptions() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'captions.json'), 'utf8')); } catch { return {}; }
}

async function getPlayers() {
  const captions = loadCaptions();
  const dirs = await fs.promises.readdir(PLAYERS_DIR, { withFileTypes: true });
  const players = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const files = (await fs.promises.readdir(path.join(PLAYERS_DIR, d.name)))
      .filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (files.length) {
      // full = original; view = versión ligera para ver en grande; thumb = miniatura.
      // Si aún no se generaron las ligeras (make-thumbs.ps1), se usa la original.
      const images = files.map((f) => {
        const enc = encodeURIComponent(d.name) + '/' + encodeURIComponent(f);
        const light = (dir) => (fs.existsSync(path.join(ROOT, 'img', dir, d.name, f + '.jpg')) ? 'img/' + dir + '/' + enc + '.jpg' : null);
        const full = 'img/Players/' + enc;
        const cap = captions[d.name + '/' + f] || {};
        return { view: light('view') || full, thumb: light('thumbs') || full, title: cap.title || '', text: cap.text || '' };
      });
      // Imagen de fondo del botón del jugador: la primera, o la que se indique en captions.json -> "_covers": { "Jugador": "archivo.png" }
      const pick = files.indexOf((captions._covers || {})[d.name]);
      players.push({ name: d.name, cover: images[pick >= 0 ? pick : 0].thumb, images });
    }
  }
  return players.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// La página pide svs.json. En local se genera al momento; además se guarda en disco, y ese archivo es el que
// se publica en Azure Static Web Apps (allí no corre este servidor, solo se sirven archivos).
async function writeSvsJson() {
  const players = await getPlayers();
  fs.writeFileSync(path.join(ROOT, 'svs.json'), JSON.stringify(players, null, 2) + '\n');
  return players;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/svs.json' || url.pathname === '/api/svs') {
    try {
      const players = await writeSvsJson();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(players));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No se pudo leer img/Players: ' + err.message }));
    }
    return;
  }

  if (url.pathname === '/api/mision-comunitaria') {
    try {
      const data = await getMission();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (err) {
      // Si falla pero hay un dato viejo, lo devolvemos marcado como desactualizado
      if (cache.data) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ...cache.data, stale: true }));
      } else {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'No se pudo consultar la API: ' + err.message }));
      }
    }
    return;
  }

  // Archivos estáticos (con protección contra salirse de la carpeta)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || path.basename(file) === 'server.js') {
    res.writeHead(403); res.end('Prohibido'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

// Genera las miniaturas de las capturas nuevas (solo Windows, usa PowerShell). Devuelve una promesa.
function makeThumbs() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'make-thumbs.ps1')], { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (b) => { out += b; });
    ps.on('error', (e) => { console.log('No se pudieron generar miniaturas: ' + e.message); resolve(); });
    ps.on('close', (code) => {
      const last = out.trim().split(/\r?\n/).pop();
      console.log(code === 0 ? last : 'make-thumbs.ps1 terminó con código ' + code);
      resolve();
    });
  });
}

async function prepare() {
  await makeThumbs();
  const players = await writeSvsJson();
  console.log('svs.json actualizado: ' + players.reduce((n, p) => n + p.images.length, 0) + ' capturas de ' + players.length + ' jugadores.');
}

if (process.argv.includes('--build')) {
  // node server.js --build  ->  solo genera miniaturas y svs.json (para publicar) y termina
  prepare().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('Test_NoMansSky listo en http://localhost:' + PORT);
    prepare().catch((e) => console.log('No se pudo actualizar svs.json: ' + e.message));
  });
}

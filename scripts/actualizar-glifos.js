// Genera glifos.json y las imágenes de la página de Glifos a partir de The Portal Repository (portalrepository.com),
// usando su API pública de WordPress (permitida por su robots.txt). Solo toma entradas del último año.
//
// Uso:  node scripts/actualizar-glifos.js
//
// - Plantas: por cada bioma/planta se eligen las entradas más recientes (primero las que tienen base).
// - Naves: las entradas recientes de naves clase S con una captura donde SE VE la nave (ver DESCARTAR_CAPTURA).
// - Los glifos se dibujan en la página a partir del código hexadecimal (0-F), con img/glifos/<0-F>.png.
// Recomendación: ejecutarlo de vez en cuando para que la página siga mostrando lo más reciente.

const fs = require('fs');
const path = require('path');

const API = 'https://portalrepository.com/wp-json/wp/v2';
const UA = 'GeopbyteStudio-fanpage/1.0 (non-profit fan page; contact oscspider@gmail.com)';
const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'img', 'glifos');
const SHIPS_DIR = path.join(IMG_DIR, 'naves');
const DIAS = 365;            // antigüedad máxima de las entradas
const POR_PLANTA = 3;
const NUM_NAVES = 10;
const PAUSA_MS = 700;        // no saturamos el sitio

const PLANTAS = [
  { slug: 'star-bulb', nombre: 'Star Bulb', bioma: 'Planetas exuberantes (Lush)' },
  { slug: 'gamma-root', nombre: 'Gamma Root', bioma: 'Planetas radiactivos' },
  { slug: 'solanium', nombre: 'Solanium', bioma: 'Planetas cálidos (Hot)' },
  { slug: 'frostwort', nombre: 'Frostwort', bioma: 'Planetas fríos (Cold)' },
  { slug: 'fungal-mold', nombre: 'Fungal Mould', bioma: 'Planetas tóxicos' },
  { slug: 'cactus-flesh', nombre: 'Cactus Flesh', bioma: 'Planetas secos (Dry)' },
  { slug: 'nipnip', nombre: 'Nipnip Buds', bioma: 'Bases que cultivan Nipnip' },
  { slug: 'sac-venom', nombre: 'Sac Venom', bioma: 'Planetas y bases donde se cultiva' }
];

// Etiquetas de naves de Portal Repository -> texto para mostrar
const TIPOS_NAVE = {
  's-class-exotic': 'Exótica clase S',
  'squid-ship': 'Calamar (Squid)',
  's-class-fighter': 'Caza clase S',
  's-class-shuttle': 'Lanzadera clase S',
  's-class-hauler': 'Carguero clase S',
  's-class-explorer': 'Explorador clase S',
  'solar-ship': 'Velero solar'
};
// Capturas revisadas a mano cuya imagen NO muestra la nave (mapa, foto del portal, paisaje o collage): la entrada se salta.
const DESCARTAR_CAPTURA = new Set([25990, 25971, 25699, 25638, 25579, 25752]);

const ETIQUETAS = {
  'base': 'Base',
  'base-near-portal': 'Base junto al portal',
  'no-sentinels': 'Sin centinelas',
  'extreme': 'Clima extremo',
  'galactic-terminal': 'Terminal galáctica',
  'settlement': 'Asentamiento',
  'wealthy': 'Sistema rico',
  'farm': 'Granja',
  'multiplayer': 'Multijugador',
  'tourism': 'Turismo',
  'moon': 'Luna'
};

const GLIFOS = { // nombre de archivo en portalrepository.com/wp-content/uploads/2017/10/
  0: '0-Ra-Glyph-e1508090048536', 1: '1-Bre-Glyph-e1508090059810', 2: '2-Mu-Glyph-e1508090069656',
  3: '3-De-Glyph-e1508090080897', 4: '4-O-Glyph-e1508090089401', 5: '5-Bo-Glyph-e1508090097161',
  6: '6-Ste-Glyph-e1508089983775', 7: '7-Shi-Glyph-e1508089993760', 8: '8-Zi-Glyph-e1508090003508',
  9: '9-Rey-Glyph-e1508090015211', A: 'A-Pi-Glyph-e1508090029886', B: 'B-Fin-Glyph-e1508090038298',
  C: 'C-Han-Glyph-e1508089924741', D: 'D-Rush-Glyph-e1508089954845', E: 'E-Tar-Glyph-e1508089967340',
  F: 'F-Vel-Glyph-e1508087592991'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, binary) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(encodeURI(url), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return binary ? res : res.json();
    } catch (e) {
      if (intento === 3) throw new Error(url + ' -> ' + e.message);
      await sleep(2000 * intento);
    }
  }
}

async function descargar(url, destino) {
  const res = await get(url, true);
  if (!/^image\//.test(res.headers.get('content-type') || '')) throw new Error('No es una imagen: ' + url);
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  await sleep(PAUSA_MS);
}

const decodeHtml = (s) => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").trim();

async function main() {
  fs.mkdirSync(SHIPS_DIR, { recursive: true });

  // 1) Etiquetas y categorías (id -> slug / nombre)
  const slugsNecesarios = [...PLANTAS.map((p) => p.slug), ...Object.keys(TIPOS_NAVE), ...Object.keys(ETIQUETAS)];
  const tagsBySlug = {};
  for (let i = 0; i < slugsNecesarios.length; i += 30) {
    const lote = slugsNecesarios.slice(i, i + 30);
    for (const t of await get(`${API}/tags?per_page=100&slug=${lote.join(',')}&_fields=id,slug`)) tagsBySlug[t.slug] = t.id;
    await sleep(PAUSA_MS);
  }
  const tagSlug = Object.fromEntries(Object.entries(tagsBySlug).map(([s, id]) => [id, s]));
  const catName = {};
  for (let pg = 1; pg <= 6; pg++) {
    const lote = await get(`${API}/categories?per_page=100&page=${pg}&_fields=id,name`).catch(() => []);
    lote.forEach((c) => { catName[c.id] = decodeHtml(c.name); });
    await sleep(PAUSA_MS);
    if (lote.length < 100) break;
  }

  // 2) Entradas del último año
  const desde = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 19);
  const posts = [];
  for (let pg = 1; ; pg++) {
    const lote = await get(`${API}/posts?per_page=100&page=${pg}&after=${desde}&_fields=id,date,link,title,tags,categories,content,featured_media`);
    posts.push(...lote);
    await sleep(PAUSA_MS);
    if (lote.length < 100) break;
  }
  console.log(`Entradas del último año: ${posts.length}`);

  const entrada = (p) => {
    const m = String(p.content && p.content.rendered).match(/\b[0-9A-F]{12}\b/);
    if (!m) return null;
    const slugs = p.tags.map((t) => tagSlug[t]).filter(Boolean);
    const cat = p.categories.map((c) => catName[c]).find((n) => n && /\(.+\)$/.test(n));
    const mm = cat && cat.match(/^(.*?)\s*\((.+)\)$/);
    return {
      id: p.id, nombre: decodeHtml(p.title.rendered) || 'Sin nombre', hex: m[0],
      fecha: p.date.slice(0, 10), url: p.link,
      galaxia: mm && !/^other/i.test(mm[1]) ? mm[1] : 'No indicada', plataforma: mm && !/^other/i.test(mm[1]) ? mm[2] : 'No indicada',
      etiquetas: Object.keys(ETIQUETAS).filter((s) => slugs.includes(s)).map((s) => ETIQUETAS[s]),
      _slugs: slugs, _media: p.featured_media
    };
  };
  const todas = posts.map(entrada).filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const limpio = ({ _slugs, _media, ...e }) => e;

  // 3) Plantas: primero las que tienen base, luego el resto; siempre de más reciente a más antigua
  const plantas = PLANTAS.map((pl) => {
    const c = todas.filter((e) => e._slugs.includes(pl.slug));
    const orden = [...c.filter((e) => e._slugs.includes('base')), ...c.filter((e) => !e._slugs.includes('base'))];
    const vistos = new Set();
    const entradas = orden.filter((e) => !vistos.has(e.hex) && vistos.add(e.hex)).slice(0, POR_PLANTA).map(limpio);
    console.log(`  ${pl.nombre}: ${entradas.length} de ${c.length} entradas`);
    return { id: pl.slug, nombre: pl.nombre, bioma: pl.bioma, entradas };
  }).filter((p) => p.entradas.length);

  // 4) Naves: entradas con etiqueta de nave y una captura donde se ve la nave
  const candidatas = todas.filter((e) => e._media && !DESCARTAR_CAPTURA.has(e._media) && e._slugs.some((s) => TIPOS_NAVE[s])).slice(0, NUM_NAVES);
  const naves = [];
  for (const e of candidatas) {
    const m = await get(`${API}/media/${e._media}?_fields=source_url,media_details`); await sleep(PAUSA_MS);
    const sizes = (m.media_details && m.media_details.sizes) || {};
    const src = (sizes.medium_large || sizes.large || { source_url: m.source_url }).source_url;
    const ext = (src.match(/\.(jpe?g|png|webp)$/i) || [, 'jpg'])[1].toLowerCase();
    const archivo = `${e.id}.${ext}`;
    await descargar(src, path.join(SHIPS_DIR, archivo));
    naves.push({ ...limpio(e), tipos: e._slugs.filter((s) => TIPOS_NAVE[s]).map((s) => TIPOS_NAVE[s]), imagen: `img/glifos/naves/${archivo}` });
  }
  console.log(`Naves: ${naves.length}`);

  // 5) Imágenes de los 16 glifos (una sola vez)
  for (const [h, f] of Object.entries(GLIFOS)) {
    const dest = path.join(IMG_DIR, `${h}.png`);
    if (!fs.existsSync(dest)) await descargar(`https://portalrepository.com/wp-content/uploads/2017/10/${f}.png`, dest);
  }

  // 6) Salida (solo se escribe si todo salió bien)
  const salida = {
    generado: new Date().toISOString().slice(0, 10),
    fuente: { nombre: 'The Portal Repository', url: 'https://portalrepository.com/' },
    plantas, naves
  };
  fs.writeFileSync(path.join(ROOT, 'glifos.json'), JSON.stringify(salida, null, 2) + '\n');
  console.log('glifos.json actualizado.');
}

main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });

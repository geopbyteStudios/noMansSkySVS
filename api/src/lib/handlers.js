// Lógica de la API de creadores, independiente de Azure Functions (así se puede probar directamente).
// Cada handler recibe { headers, body, query, params } y devuelve { status, body, headers }.
const crypto = require('crypto');
const auth = require('./auth');
const store = require('./storage');
const { describe, isTipo } = require('./describe');
const notify = require('./notify');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_VIEW = 3 * 1024 * 1024;   // versión grande (JPEG, ya reducida por la página)
const MAX_THUMB = 600 * 1024;       // miniatura
const MAX_DESC = 600;
const MAX_PER_USER = 300;

const out = (status, body, headers) => ({ status, body, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(headers || {}) } });
const isSecure = (req) => !/^(localhost|127\.|\[::1\])/.test(String(req.headers['x-forwarded-host'] || req.headers.host || ''));

async function currentUser(req) {
  const token = auth.getCookie(req.headers.cookie, auth.COOKIE);
  const s = auth.readSession(token);
  if (!s) return null;
  const u = await store.getUser(s.u);          // se relee: si desactivas a alguien, pierde el acceso al momento
  return u && u.activo !== false ? u : null;
}
const publicUser = (u) => ({ usuario: u.rowKey, nombre: u.nombre, rol: u.rol });

async function login(req) {
  const usuario = auth.normUser(req.body && req.body.usuario);
  const clave = req.body && typeof req.body.clave === 'string' ? req.body.clave : '';
  const bad = out(401, { error: 'Usuario o contraseña incorrectos.' });
  if (!auth.validUser(usuario) || !clave || clave.length > 200) { auth.burnTime(clave); return bad; }

  const u = await store.getUser(usuario);
  if (!u || u.activo === false) { auth.burnTime(clave); return bad; }
  if (u.bloqueadoHasta && Number(u.bloqueadoHasta) > Date.now()) {
    const min = Math.ceil((Number(u.bloqueadoHasta) - Date.now()) / 60000);
    return out(429, { error: `Demasiados intentos. Inténtalo de nuevo en ${min} min.` });
  }
  if (!auth.verifyPassword(clave, u.salt, u.hash)) {
    const fallos = Number(u.fallos || 0) + 1;
    const patch = { partitionKey: 'u', rowKey: usuario, fallos: fallos >= MAX_FAILS ? 0 : fallos };
    if (fallos >= MAX_FAILS) patch.bloqueadoHasta = Date.now() + LOCK_MS;
    await store.clients().users.updateEntity(patch, 'Merge');
    return bad;
  }
  if (Number(u.fallos || 0) > 0 || u.bloqueadoHasta) await store.clients().users.updateEntity({ partitionKey: 'u', rowKey: usuario, fallos: 0, bloqueadoHasta: 0 }, 'Merge');
  const token = auth.signSession({ u: usuario });
  return out(200, { ok: true, usuario: publicUser(u), debeCambiarClave: u.claveCambiada !== true }, { 'Set-Cookie': auth.sessionCookie(token, isSecure(req)) });
}

async function logout(req) {
  return out(200, { ok: true }, { 'Set-Cookie': auth.clearCookie(isSecure(req)) });
}

async function yo(req) {
  const u = await currentUser(req);
  return u ? out(200, { ...publicUser(u), debeCambiarClave: u.claveCambiada !== true }) : out(401, { error: 'Sin sesión.' });
}

async function cambiarClave(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  const { actual, nueva } = req.body || {};
  if (typeof actual !== 'string' || !auth.verifyPassword(actual, u.salt, u.hash)) return out(400, { error: 'La contraseña actual no es correcta.' });
  const problem = auth.passwordProblem(nueva);
  if (problem) return out(400, { error: problem });
  if (nueva === actual) return out(400, { error: 'La nueva contraseña debe ser distinta de la actual.' });
  const h = auth.hashPassword(nueva);
  await store.clients().users.updateEntity({ partitionKey: 'u', rowKey: u.rowKey, salt: h.salt, hash: h.hash, claveCambiada: true }, 'Merge');
  return out(200, { ok: true });
}

const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const isJpeg = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

async function permisoSubida(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  const id = newId();
  return out(200, { id, thumbUrl: store.uploadUrl(`thumbs/${u.rowKey}/${id}.jpg`), viewUrl: store.uploadUrl(`view/${u.rowKey}/${id}.jpg`) });
}

async function download(path) {
  const blob = store.clients().container.getBlockBlobClient(path);
  try { return await blob.downloadToBuffer(); } catch (e) { if (e.statusCode === 404) return null; throw e; }
}
async function removeBlobs(usuario, id) {
  for (const d of ['thumbs', 'view']) await store.clients().container.deleteBlob(`${d}/${usuario}/${id}.jpg`).catch(() => {});
}

function titleFrom(text) {
  const first = text.split(/(?<=[.!?])\s|\n/)[0].trim();
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
}

async function registrar(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  const id = String((req.body && req.body.id) || '');
  if (!/^[a-z0-9]{8,30}$/.test(id)) return out(400, { error: 'Identificador de captura no válido.' });
  const descripcion = String((req.body && req.body.descripcion) || '').replace(/\s+\n/g, '\n').trim();
  if (descripcion.length > MAX_DESC) return out(400, { error: `La descripción admite hasta ${MAX_DESC} caracteres.` });

  const c = store.clients();
  let count = 0; for await (const _ of c.shots.listEntities({ queryOptions: { filter: `PartitionKey eq '${u.rowKey}'` } })) { if (++count >= MAX_PER_USER) break; }
  if (count >= MAX_PER_USER) return out(400, { error: 'Alcanzaste el máximo de capturas.' });

  const view = await download(`view/${u.rowKey}/${id}.jpg`);
  const thumb = await download(`thumbs/${u.rowKey}/${id}.jpg`);
  if (!view || !thumb) { await removeBlobs(u.rowKey, id); return out(400, { error: 'No se encontró la imagen subida. Inténtalo de nuevo.' }); }
  if (!isJpeg(view) || !isJpeg(thumb) || view.length > MAX_VIEW || thumb.length > MAX_THUMB) {
    await removeBlobs(u.rowKey, id);
    return out(400, { error: 'La imagen no es válida o es demasiado pesada.' });
  }
  const tipo = String((req.body && req.body.tipo) || 'otro');
  if (!isTipo(tipo)) return out(400, { error: 'Tipo de captura no válido.' });
  const d = descripcion ? { titulo: titleFrom(descripcion), texto: descripcion, generada: false } : describe(tipo, u.nombre);
  // Las capturas de los creadores quedan pendientes hasta que un administrador las apruebe; las del admin se publican solas
  const estado = u.rol === 'admin' ? 'aprobada' : 'pendiente';
  await c.shots.createEntity({
    partitionKey: u.rowKey, rowKey: id, nombre: u.nombre,
    titulo: d.titulo, texto: d.texto, generada: d.generada === true,
    estado, creado: new Date().toISOString()
  });
  if (estado === 'pendiente') {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    await notify.capturaPendiente({ nombre: u.nombre, titulo: d.titulo, panelUrl: (process.env.SITE_URL || 'https://' + host) + '/creadores.html' });
  }
  return out(201, { ok: true, id, estado, titulo: d.titulo, texto: d.texto, generada: d.generada === true });
}

const shape = (e) => ({
  id: e.rowKey, usuario: e.partitionKey,
  thumb: store.blobUrl(`thumbs/${e.partitionKey}/${e.rowKey}.jpg`),
  view: store.blobUrl(`view/${e.partitionKey}/${e.rowKey}.jpg`),
  title: e.titulo || '', text: e.texto || '', auto: e.generada === true, creado: e.creado,
  estado: e.estado || 'aprobada'   // las anteriores a la revisión cuentan como aprobadas
});

// Público: capturas subidas por creadores, agrupadas por jugador (misma forma que svs.json)
async function listar() {
  const byName = new Map();
  for await (const e of store.clients().shots.listEntities()) {
    if (e.estado === 'pendiente') continue;   // lo pendiente NO se muestra públicamente
    const arr = byName.get(e.nombre) || []; arr.push(shape(e)); byName.set(e.nombre, arr);
  }
  const players = [...byName.entries()].map(([name, images]) => {
    images.sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
    return { name, cover: images[0].thumb, images };
  });
  return out(200, players, { 'Cache-Control': 'public, max-age=30' });
}

async function misCapturas(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  const list = [];
  const filter = u.rol === 'admin' ? undefined : `PartitionKey eq '${u.rowKey}'`;
  for await (const e of store.clients().shots.listEntities(filter ? { queryOptions: { filter } } : undefined)) list.push({ ...shape(e), nombre: e.nombre });
  list.sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  return out(200, list);
}

async function borrar(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  const id = String(req.params.id || '');
  const owner = auth.normUser(req.query.u || u.rowKey);
  if (!/^[a-z0-9]{8,30}$/.test(id) || !auth.validUser(owner)) return out(400, { error: 'Solicitud no válida.' });
  if (owner !== u.rowKey && u.rol !== 'admin') return out(403, { error: 'No puedes borrar capturas de otra persona.' });
  try { await store.clients().shots.deleteEntity(owner, id); } catch (e) { if (e.statusCode !== 404) throw e; }
  await removeBlobs(owner, id);
  return out(200, { ok: true });
}

// Solo administradores: publica una captura pendiente. (Rechazar = borrar, que ya existe.)
async function aprobar(req) {
  const u = await currentUser(req);
  if (!u) return out(401, { error: 'Sin sesión.' });
  if (u.rol !== 'admin') return out(403, { error: 'Solo un administrador puede aprobar capturas.' });
  const id = String((req.body && req.body.id) || '');
  const owner = auth.normUser(req.body && req.body.usuario);
  if (!/^[a-z0-9]{8,30}$/.test(id) || !auth.validUser(owner)) return out(400, { error: 'Solicitud no válida.' });
  try { await store.clients().shots.updateEntity({ partitionKey: owner, rowKey: id, estado: 'aprobada' }, 'Merge'); }
  catch (e) { if (e.statusCode === 404) return out(404, { error: 'La captura ya no existe.' }); throw e; }
  return out(200, { ok: true });
}

module.exports = { login, logout, yo, cambiarClave, permisoSubida, registrar, listar, misCapturas, borrar, aprobar };

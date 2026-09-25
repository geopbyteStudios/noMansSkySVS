// Contraseñas y sesiones. Sin dependencias externas: solo el módulo crypto de Node.
//  - Las contraseñas se guardan como huella scrypt (con sal propia por usuario), nunca en texto plano.
//  - La sesión es una cookie HttpOnly firmada con HMAC-SHA256 (SESSION_SECRET), con caducidad.
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;
const COOKIE = 'svs_sesion';
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 horas

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, SCRYPT);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(password, saltHex, hashHex) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(hashHex || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Contraseña de relleno para gastar el mismo tiempo cuando el usuario no existe (evita revelar qué usuarios hay)
const DUMMY = hashPassword('relleno-no-valido');
function burnTime(password) { verifyPassword(password, DUMMY.salt, DUMMY.hash); }

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('Falta SESSION_SECRET (mínimo 32 caracteres)');
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function signSession(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + SESSION_MS }));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function readSession(token) {
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function getCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function sessionCookie(token, secure) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` + (secure ? '; Secure' : '');
}
function clearCookie(secure) {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` + (secure ? '; Secure' : '');
}

// Reglas de contraseña: mínimo 10 caracteres y que no sea trivial
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (pw.length > 200) return 'La contraseña es demasiado larga.';
  if (/^(.)\1+$/.test(pw)) return 'La contraseña es demasiado simple.';
  return null;
}

function randomPassword() {
  // 16 caracteres, sin símbolos confusos
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (const byte of crypto.randomBytes(16)) out += alphabet[byte % alphabet.length];
  return out;
}

const normUser = (u) => String(u || '').trim().toLowerCase();
const validUser = (u) => /^[a-z0-9][a-z0-9_.-]{2,29}$/.test(u);

module.exports = { hashPassword, verifyPassword, burnTime, signSession, readSession, getCookie, sessionCookie, clearCookie, passwordProblem, randomPassword, normUser, validUser, COOKIE };

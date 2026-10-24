'use strict';
// Ruta privada para el panel de Geopbyte Studio: total de usuarios, solo con la llave del panel. Uso: node api/test/estadisticas.cjs
const assert = require('node:assert/strict');
process.env.STATS_KEY = 'k'.repeat(40);
const store = require('../src/lib/storage');
store.contarUsuarios = async () => 7;          // sin tocar Azure
const h = require('../src/lib/handlers');
const get = (clave) => h.estadisticas({ headers: clave === undefined ? {} : { 'x-clave-panel': clave }, body: null, query: {}, params: {} });
(async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await get('otra')).status, 401);
  const r = await get('k'.repeat(40));
  assert.equal(r.status, 200); assert.deepEqual(r.body, { cuentas: 7 });
  delete process.env.STATS_KEY;
  assert.equal((await get('')).status, 401, 'sin STATS_KEY nunca responde datos');
  console.log('estadisticas OK');
})().catch((e) => { console.error(e); process.exit(1); });

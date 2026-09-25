// GET /api/mision-comunitaria
// Intermediario con la API de la comunidad (api.nmsassistant.com), porque esa API no permite
// consultas directas desde el navegador (CORS). Equivale a la ruta del mismo nombre de server.js.
const { app } = require('@azure/functions');

const UPSTREAM = 'https://api.nmsassistant.com/HelloGames/CommunityMission';
const CACHE_MS = 60 * 1000; // no molestamos a la API más de 1 vez por minuto

let cache = { at: 0, data: null };

async function getMission() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const res = await fetch(UPSTREAM, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('La API respondió ' + res.status);
  const data = await res.json();
  cache = { at: Date.now(), data };
  return data;
}

app.http('mision-comunitaria', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'mision-comunitaria',
  handler: async () => {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      return { status: 200, headers, jsonBody: await getMission() };
    } catch (err) {
      // Si falla pero hay un dato viejo, lo devolvemos marcado como desactualizado
      if (cache.data) return { status: 200, headers, jsonBody: { ...cache.data, stale: true } };
      return { status: 502, headers, jsonBody: { error: 'No se pudo consultar la API: ' + err.message } };
    }
  }
});

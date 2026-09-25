// Rutas HTTP del acceso para creadores. La lógica está en ../lib/handlers.js
const { app } = require('@azure/functions');
const h = require('../lib/handlers');

async function toReq(request) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  let body = null;
  if (request.method === 'POST') {
    if (!/application\/json/i.test(headers['content-type'] || '')) return { bad: true, headers };
    try { body = await request.json(); } catch { return { bad: true, headers }; }
  }
  return { headers, body, query: Object.fromEntries(request.query.entries()), params: request.params || {} };
}

function route(name, methods, path, handler) {
  app.http(name, {
    methods, authLevel: 'anonymous', route: path,
    handler: async (request, context) => {
      try {
        const req = await toReq(request);
        if (req.bad) return { status: 400, headers: { 'Cache-Control': 'no-store' }, jsonBody: { error: 'Solicitud no válida.' } };
        const r = await handler(req);
        return { status: r.status, headers: r.headers, jsonBody: r.body };
      } catch (err) {
        context.error('Error en ' + name + ': ' + (err && err.stack || err));
        return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { error: 'Error interno. Inténtalo más tarde.' } };
      }
    }
  });
}

route('creadores-login', ['POST'], 'creadores/login', h.login);
route('creadores-logout', ['POST'], 'creadores/logout', h.logout);
route('creadores-yo', ['GET'], 'creadores/yo', h.yo);
route('creadores-clave', ['POST'], 'creadores/clave', h.cambiarClave);
route('creadores-permiso', ['POST'], 'creadores/permiso', h.permisoSubida);
route('creadores-registrar', ['POST'], 'creadores/capturas', h.registrar);
route('creadores-mias', ['GET'], 'creadores/mias', h.misCapturas);
route('creadores-borrar', ['DELETE'], 'creadores/capturas/{id}', h.borrar);
route('capturas-publicas', ['GET'], 'capturas', h.listar);

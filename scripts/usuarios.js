// Administración de cuentas de creadores (solo se usa desde tu PC; NO se publica en el sitio).
//   node scripts/usuarios.js crear <usuario> <NombreDelJugador> [admin]
//   node scripts/usuarios.js reiniciar <usuario>      (genera una contraseña nueva)
//   node scripts/usuarios.js desactivar <usuario> | activar <usuario>
//   node scripts/usuarios.js listar
// Necesita la variable de entorno STORAGE_CONNECTION (usuarios.ps1 la obtiene de Azure por ti).
// Las contraseñas generadas NO se imprimen: se guardan en scripts/credenciales.txt (ignorado por git).
const fs = require('fs');
const path = require('path');
const auth = require('../api/src/lib/auth');
const store = require('../api/src/lib/storage');

const FILE = path.join(__dirname, 'credenciales.txt');
const [cmd, arg1, arg2, arg3] = process.argv.slice(2);

function saveCredential(usuario, nombre, clave, motivo) {
  fs.appendFileSync(FILE, `[${new Date().toISOString()}] ${motivo}\n  usuario: ${usuario}\n  jugador: ${nombre}\n  contraseña temporal: ${clave}\n\n`);
}

(async () => {
  if (!process.env.STORAGE_CONNECTION) throw new Error('Falta STORAGE_CONNECTION (usa usuarios.ps1)');
  const users = store.clients().users;
  const usuario = auth.normUser(arg1);

  if (cmd === 'listar') {
    for await (const u of users.listEntities()) console.log(`${u.rowKey.padEnd(20)} ${String(u.nombre).padEnd(20)} ${u.rol.padEnd(8)} ${u.activo === false ? 'DESACTIVADO' : 'activo'}  ${u.claveCambiada ? '' : '(aún con contraseña temporal)'}`);
    return;
  }
  if (!auth.validUser(usuario)) throw new Error('Usuario no válido: 3-30 caracteres, minúsculas, números, punto, guion o guion bajo.');

  if (cmd === 'crear') {
    const nombre = String(arg2 || '').trim();
    if (!/^[A-Za-z0-9 _.-]{2,40}$/.test(nombre)) throw new Error('Indica el nombre del jugador tal como se ve en la galería (p. ej. Maya).');
    if (await store.getUser(usuario)) throw new Error('Ese usuario ya existe (usa "reiniciar" para darle otra contraseña).');
    const clave = auth.randomPassword(); const h = auth.hashPassword(clave);
    await users.createEntity({ partitionKey: 'u', rowKey: usuario, nombre, rol: arg3 === 'admin' ? 'admin' : 'creador', salt: h.salt, hash: h.hash, activo: true, claveCambiada: false, fallos: 0, bloqueadoHasta: 0, creado: new Date().toISOString() });
    saveCredential(usuario, nombre, clave, 'Cuenta creada');
    console.log(`Cuenta "${usuario}" creada (${arg3 === 'admin' ? 'admin' : 'creador'}). La contraseña temporal está en ${FILE}`);
  } else if (cmd === 'reiniciar') {
    const u = await store.getUser(usuario); if (!u) throw new Error('No existe ese usuario.');
    const clave = auth.randomPassword(); const h = auth.hashPassword(clave);
    await users.updateEntity({ partitionKey: 'u', rowKey: usuario, salt: h.salt, hash: h.hash, claveCambiada: false, fallos: 0, bloqueadoHasta: 0 }, 'Merge');
    saveCredential(usuario, u.nombre, clave, 'Contraseña reiniciada');
    console.log(`Contraseña de "${usuario}" reiniciada. La nueva temporal está en ${FILE}`);
  } else if (cmd === 'desactivar' || cmd === 'activar') {
    if (!(await store.getUser(usuario))) throw new Error('No existe ese usuario.');
    await users.updateEntity({ partitionKey: 'u', rowKey: usuario, activo: cmd === 'activar' }, 'Merge');
    console.log(`Cuenta "${usuario}" ${cmd === 'activar' ? 'activada' : 'desactivada'}.`);
  } else {
    console.log('Comandos: crear <usuario> <Jugador> [admin] | reiniciar <usuario> | desactivar <usuario> | activar <usuario> | listar');
  }
})().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });

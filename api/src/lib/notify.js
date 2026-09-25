// Aviso gratuito a Discord (webhook) cuando hay una captura pendiente de aprobar.
// La URL del webhook es un secreto: vive solo en la configuración de Azure (DISCORD_WEBHOOK_URL).
// Si falta o falla, la subida NO se interrumpe: el aviso es un extra.
const HOOK = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const clean = (s, max) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[`*_~|>]/g, '').trim().slice(0, max);

async function capturaPendiente({ nombre, titulo, panelUrl }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url || !HOOK.test(url)) return { enviado: false, motivo: 'sin webhook' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'SVS · Aprobaciones',
        content: `🛰️ **${clean(nombre, 40)}** subió una captura y está **pendiente de aprobación**: «${clean(titulo, 80)}»\nRevísala aquí: ${panelUrl}`,
        allowed_mentions: { parse: [] }   // nadie puede provocar menciones (@everyone, etc.) con su texto
      }),
      signal: AbortSignal.timeout(5000)
    });
    return { enviado: res.ok, motivo: res.ok ? '' : 'Discord respondió ' + res.status };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}

module.exports = { capturaPendiente, HOOK };

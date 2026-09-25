// Descripción automática de una captura con Claude (visión).
// Si falta la clave (ANTHROPIC_API_KEY) o algo falla, se usa un texto genérico: nunca se bloquea la subida.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const SYSTEM = `Eres el redactor de una fan page en español de No Man's Sky. Te paso una captura hecha por un jugador.
Escribe un título corto (máximo 60 caracteres) y una explicación de 3 a 4 renglones (250-380 caracteres) que diga qué se ve en la imagen
y, si aplica, qué mecánica o dato del juego representa (tipos de nave, estaciones, biomas, criaturas, razas, clima, construcción de bases, expediciones, lore...).
Reglas: usa solo lo que se ve; si dudas de algo, dilo con prudencia ("parece", "podría ser"); no inventes nombres, cifras ni fechas;
no describas nombres de usuario ni texto personal que aparezca en pantalla; tono cercano y claro.
Responde ÚNICAMENTE con JSON válido: {"titulo": "...", "texto": "..."}`;

function fallback(nombre) {
  return { titulo: 'Captura de ' + nombre, texto: `Captura de ${nombre} en No Man's Sky.`, generada: false };
}

async function describe(imageBuffer, nombre) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback(nombre);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') } },
          { type: 'text', text: 'Describe esta captura para la galería.' }
        ] }]
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error('Anthropic respondió ' + res.status);
    const data = await res.json();
    const raw = (data.content || []).map((b) => b.text || '').join('');
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const titulo = String(json.titulo || '').trim().slice(0, 80);
    const texto = String(json.texto || '').trim().slice(0, 500);
    if (!titulo || !texto) throw new Error('Respuesta incompleta');
    return { titulo, texto, generada: true };
  } catch (e) {
    return { ...fallback(nombre), error: e.message };
  }
}

module.exports = { describe, fallback };

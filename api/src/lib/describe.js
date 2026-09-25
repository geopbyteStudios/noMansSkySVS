// Descripción automática GRATIS de una captura, sin IA ni servicios de pago.
// Si quien sube no escribe nada, se usa un texto preparado según el "tipo de captura" que elija (o uno genérico).
// Los textos son informativos sobre el juego, no describen la imagen en concreto.
const TIPOS = {
  nave: { etiqueta: 'Nave', texto: 'En No Man\'s Sky hay nueve tipos de nave: lanzadera, caza, hauler, explorador, exótica, interceptor, solar, corbeta y nave viviente. Cada una tiene sus propias bonificaciones, y también su clase (C, B, A o S).' },
  planeta: { etiqueta: 'Planeta', texto: 'Cada planeta se genera de forma procedural, con su propio bioma, clima, flora y fauna. Puedes aterrizar en casi cualquiera, catalogar lo que encuentres y ganar unidades por tus descubrimientos.' },
  base: { etiqueta: 'Base', texto: 'Las bases se construyen con piezas de todo tipo y pueden ser lo que imagines: desde una cabaña hasta una ciudad entera, incluso bajo el agua. La comunidad las convierte en verdaderas obras de arte.' },
  estacion: { etiqueta: 'Estación espacial', texto: 'Las estaciones espaciales son el centro del comercio: misiones, compra y venta de recursos, cartógrafos y cambio de nave. Se entra siguiendo un rayo tractor azul hasta una de sus plataformas de aterrizaje.' },
  espacio: { etiqueta: 'En el espacio', texto: 'En el espacio puedes minar asteroides, luchar contra piratas y viajar entre sistemas estelares. Cada sistema tiene su propia estrella, y el espacio cambia de color de un lugar a otro.' },
  criatura: { etiqueta: 'Criatura', texto: 'La fauna de cada planeta es única. Escanearla y subirla al catálogo de descubrimientos da unidades, y algunas criaturas pueden domesticarse para acompañarte.' },
  personaje: { etiqueta: 'Viajero', texto: 'Los viajeros pueden personalizar su traje, su casco y su mochila en los modificadores de apariencia de las estaciones y de la Anomalía Espacial, así que cada uno luce un estilo propio.' },
  expedicion: { etiqueta: 'Expedición', texto: 'Las expediciones son eventos de temporada con fases e hitos que dan recompensas exclusivas, las cuales se canjean gratis en cualquier partida desde la Anomalía Espacial.' },
  otro: { etiqueta: 'Captura', texto: 'Una aventura más por la galaxia de No Man\'s Sky, un universo generado proceduralmente con más de 18 quintillones de planetas.' }
};

const isTipo = (t) => Object.prototype.hasOwnProperty.call(TIPOS, t);

function describe(tipo, nombre) {
  const t = TIPOS[isTipo(tipo) ? tipo : 'otro'];
  return { titulo: `${t.etiqueta} de ${nombre}`, texto: `Captura de ${nombre}. ${t.texto}`, generada: true };
}

module.exports = { describe, TIPOS, isTipo };

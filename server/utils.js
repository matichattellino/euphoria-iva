/**
 * Parsea un monto en formato argentino "1.234,56" a número.
 * Punto = separador de miles, coma = decimal.
 */
function parseMontoAR(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Mapea código numérico de tipo de comprobante AFIP a nombre legible.
 */
const TIPOS_COMPROBANTE = {
  1: 'Factura A',
  2: 'Nota de Débito A',
  3: 'Nota de Crédito A',
  6: 'Factura B',
  7: 'Nota de Débito B',
  8: 'Nota de Crédito B',
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
};

function tipoComprobanteName(codigo) {
  return TIPOS_COMPROBANTE[codigo] || `Tipo ${codigo}`;
}

/**
 * Devuelve el nombre del mes en español para un número 1-12.
 */
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function nombreMes(num) {
  return MESES[(num - 1)] || '';
}

/**
 * Formatea una fecha dd/mm/yyyy a objeto { dia, mes, anio }.
 */
function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  const parts = fechaStr.split('/');
  if (parts.length !== 3) return null;
  return { dia: parts[0], mes: parts[1], anio: parts[2] };
}

/**
 * Calcula resumen de facturación e IVA a partir de comprobantes normalizados.
 */
function calcularResumenFromComprobantes(emitidas, recibidas) {
  const facturacion_emitida = emitidas.reduce((s, c) => s + c.total, 0);
  const facturacion_recibida = recibidas.reduce((s, c) => s + c.total, 0);
  const iva_debito = emitidas.reduce((s, c) => s + c.iva, 0);
  const iva_credito = recibidas.reduce((s, c) => s + c.iva, 0);
  const posicion_iva = iva_debito - iva_credito;

  return {
    facturacion_emitida: Math.round(facturacion_emitida * 100) / 100,
    facturacion_recibida: Math.round(facturacion_recibida * 100) / 100,
    iva_debito: Math.round(iva_debito * 100) / 100,
    iva_credito: Math.round(iva_credito * 100) / 100,
    posicion_iva: Math.round(posicion_iva * 100) / 100,
    cantidad_emitidas: emitidas.length,
    cantidad_recibidas: recibidas.length,
  };
}

/**
 * Agrupa IVA por día a partir de comprobantes normalizados.
 */
function calcularIvaDiario(emitidas, recibidas) {
  const map = {};
  for (const c of emitidas) {
    const f = parseFecha(c.fecha);
    if (f) {
      const dia = f.dia;
      map[dia] = map[dia] || { dia, debito: 0, credito: 0 };
      map[dia].debito += c.iva;
    }
  }
  for (const c of recibidas) {
    const f = parseFecha(c.fecha);
    if (f) {
      const dia = f.dia;
      map[dia] = map[dia] || { dia, debito: 0, credito: 0 };
      map[dia].credito += c.iva;
    }
  }
  return Object.values(map)
    .map((d) => ({
      ...d,
      debito: Math.round(d.debito * 100) / 100,
      credito: Math.round(d.credito * 100) / 100,
    }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

module.exports = {
  parseMontoAR,
  tipoComprobanteName,
  nombreMes,
  parseFecha,
  TIPOS_COMPROBANTE,
  MESES,
  calcularResumenFromComprobantes,
  calcularIvaDiario,
};

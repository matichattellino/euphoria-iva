/**
 * Formatea un número como moneda argentina: $ 1.234.567,89
 */
export function formatMoney(value) {
  if (value == null || isNaN(value)) return '$ 0,00';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

/**
 * Formatea un número compacto (sin decimales, con separador de miles).
 */
export function formatCompact(value) {
  if (value == null || isNaN(value)) return '0';
  return Math.round(value).toLocaleString('es-AR');
}

/**
 * Mapea código de tipo de comprobante a color de badge.
 */
export function tipoColor(tipoCodigo) {
  const colors = {
    1: 'bg-blue-500/20 text-blue-400',      // Factura A
    2: 'bg-orange-500/20 text-orange-400',   // ND A
    3: 'bg-red-500/20 text-red-400',         // NC A
    6: 'bg-indigo-500/20 text-indigo-400',   // Factura B
    7: 'bg-orange-500/20 text-orange-400',   // ND B
    8: 'bg-red-500/20 text-red-400',         // NC B
    11: 'bg-purple-500/20 text-purple-400',  // Factura C
    12: 'bg-orange-500/20 text-orange-400',  // ND C
    13: 'bg-red-500/20 text-red-400',        // NC C
  };
  return colors[tipoCodigo] || 'bg-slate-500/20 text-slate-400';
}

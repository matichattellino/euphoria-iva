const CLIENTES = [
  'TEXTIL RAFAELA S.A.', 'DISTRIBUIDORA NORTE SRL', 'CONFECCIONES DEL LITORAL SA',
  'MAYORISTA CENTRO SA', 'IMPORTADORA TEXTIL SRL', 'MODA EXPRESS SA',
  'GARCIA MARIA LAURA', 'LOPEZ CAROLINA', 'MARTINEZ ANA',
  'FERNANDEZ LUCIANA', 'PEREZ VALENTINA', 'RODRIGUEZ CAMILA',
];

const PROVEEDORES = [
  'TELAS DEL SUR SA', 'HILANDERÍA PAMPEANA SRL', 'ESTAMPADOS GRÁFICOS SA',
  'TRANSPORTE RAFAELA', 'PACKAGING SANTA FE SRL', 'ETIQUETAS PREMIUM SA',
  'MERCERÍA INDUSTRIAL SRL', 'INSUMOS TEXTILES SA',
];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Generador seeded para que los mismos rangos den los mismos resultados
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseDDMMYYYY(str) {
  const p = str.split('/');
  return { dia: parseInt(p[0], 10), mes: parseInt(p[1], 10), anio: parseInt(p[2], 10) };
}

function getDaysInRange(desde, hasta) {
  const d = parseDDMMYYYY(desde);
  const h = parseDDMMYYYY(hasta);
  const start = new Date(d.anio, d.mes - 1, d.dia);
  const end = new Date(h.anio, h.mes - 1, h.dia);
  const days = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    // Saltar domingos
    if (dt.getDay() !== 0) {
      days.push(`${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`);
    }
  }
  return days;
}

function generateComprobantes(days, nombres, tipo, rng) {
  const comprobantes = [];
  let numFA = 1200;
  let numFB = 4500;
  let numNC = 88;

  for (const fecha of days) {
    // 2-4 comprobantes por día
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = rng();
      let tipoCodigo, tipoNombre, numRef;
      if (r < 0.45) {
        tipoCodigo = 1; tipoNombre = 'Factura A'; numFA++; numRef = numFA;
      } else if (r < 0.85) {
        tipoCodigo = 6; tipoNombre = 'Factura B'; numFB++; numRef = numFB;
      } else {
        tipoCodigo = tipo === 'E' ? 3 : 3;
        tipoNombre = 'Nota de Crédito A';
        numNC++; numRef = numNC;
      }

      const isNC = tipoCodigo === 3 || tipoCodigo === 8 || tipoCodigo === 13;
      const base = Math.round((30000 + rng() * 800000) * 100) / 100;
      const neto = isNC ? -Math.round(base * 0.15 * 100) / 100 : base;
      const iva = Math.round(neto * 0.21 * 100) / 100;
      const total = Math.round((neto + iva) * 100) / 100;

      comprobantes.push({
        fecha,
        tipoCodigo,
        tipoNombre,
        puntoVenta: '0002',
        numeroDesde: String(numRef).padStart(8, '0'),
        numeroHasta: String(numRef).padStart(8, '0'),
        denominacion: nombres[Math.floor(rng() * nombres.length)],
        nroDoc: '30' + String(Math.floor(rng() * 900000000) + 100000000),
        netoGravado: neto,
        netoNoGravado: 0,
        exento: 0,
        iva,
        otrosTributos: 0,
        total,
        cae: '7326' + String(Math.floor(rng() * 9000000000) + 1000000000),
        moneda: 'PES',
        tipoCambio: 1,
      });
    }
  }
  return comprobantes;
}

function calcularResumen(emitidas, recibidas) {
  const facturacion_emitida = emitidas.reduce((s, c) => s + c.total, 0);
  const facturacion_recibida = recibidas.reduce((s, c) => s + c.total, 0);
  const iva_debito = emitidas.reduce((s, c) => s + c.iva, 0);
  const iva_credito = recibidas.reduce((s, c) => s + c.iva, 0);

  return {
    facturacion_emitida: Math.round(facturacion_emitida * 100) / 100,
    facturacion_recibida: Math.round(facturacion_recibida * 100) / 100,
    iva_debito: Math.round(iva_debito * 100) / 100,
    iva_credito: Math.round(iva_credito * 100) / 100,
    posicion_iva: Math.round((iva_debito - iva_credito) * 100) / 100,
    cantidad_emitidas: emitidas.length,
    cantidad_recibidas: recibidas.length,
  };
}

function calcularIvaDiario(emitidas, recibidas) {
  const map = {};
  for (const c of emitidas) {
    const dia = c.fecha.split('/')[0];
    map[dia] = map[dia] || { dia, debito: 0, credito: 0 };
    map[dia].debito += c.iva;
  }
  for (const c of recibidas) {
    const dia = c.fecha.split('/')[0];
    map[dia] = map[dia] || { dia, debito: 0, credito: 0 };
    map[dia].credito += c.iva;
  }
  return Object.values(map)
    .map((d) => ({ ...d, debito: Math.round(d.debito * 100) / 100, credito: Math.round(d.credito * 100) / 100 }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Genera datos mock dinámicos para un rango de fechas.
 */
export function generateMockData(fechaDesde, fechaHasta) {
  const d = parseDDMMYYYY(fechaDesde);
  // Seed basado en mes + año para datos consistentes por periodo
  const seed = d.anio * 100 + d.mes;

  const rngE = seededRandom(seed * 7);
  const rngR = seededRandom(seed * 13);

  const days = getDaysInRange(fechaDesde, fechaHasta);
  const emitidas = generateComprobantes(days, CLIENTES, 'E', rngE);
  const recibidas = generateComprobantes(days.filter((_, i) => i % 2 === 0), PROVEEDORES, 'R', rngR);

  const periodo = `${MESES[d.mes - 1]} ${d.anio}`;

  return {
    periodo,
    resumen: calcularResumen(emitidas, recibidas),
    emitidas,
    recibidas,
    iva_diario: calcularIvaDiario(emitidas, recibidas),
  };
}

// Default: Enero 2026
export const mockData = generateMockData('01/01/2026', '31/01/2026');

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const AdmZip = require('adm-zip');
const {
  parseMontoAR,
  tipoComprobanteName,
  MESES,
  calcularResumenFromComprobantes,
  calcularIvaDiario,
} = require('./utils');

const CSV_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'csv') : path.resolve(__dirname, '..', 'data', 'csv');

/**
 * Lee y parsea un archivo CSV de ARCA.
 * Detecta si el archivo es un ZIP (ARCA descarga ZIPs) y extrae el CSV.
 * Detecta encoding (UTF-8 con BOM / Latin-1), auto-detect delimitador.
 */
function parseCSVFile(filePath) {
  let raw = fs.readFileSync(filePath);

  // Detect ZIP files (magic bytes: PK\x03\x04)
  if (raw[0] === 0x50 && raw[1] === 0x4b) {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const csvEntry = entries.find((e) => e.entryName.endsWith('.csv'));
    if (!csvEntry) {
      throw new Error(`No se encontró CSV dentro del ZIP: ${filePath}`);
    }
    raw = csvEntry.getData();

    // Also extract and replace the file for future reads
    const extractedPath = filePath; // overwrite the .csv path
    fs.writeFileSync(extractedPath, raw);
  }

  // Strip UTF-8 BOM
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    raw = raw.subarray(3);
  }

  const text = raw.toString('utf-8');

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: ';',
  });

  return result.data;
}

/**
 * Normaliza una fila cruda del CSV de ARCA al formato interno de comprobante.
 *
 * ARCA descarga CSVs con delimitador ";" y columnas desglosadas por alícuota:
 *   "IVA 21%", "Imp. Neto Gravado IVA 21%", "Total IVA", "Imp. Neto Gravado Total", etc.
 */
function normalizeCSVRow(raw) {
  const tipoCodigo = parseInt(raw['Tipo de Comprobante'] || raw['Tipo'] || '0', 10);

  // IVA: sumar todas las alícuotas o usar "Total IVA"
  const iva = parseMontoAR(raw['Total IVA'])
    || (parseMontoAR(raw['IVA 21%']) + parseMontoAR(raw['IVA 10,5%']) + parseMontoAR(raw['IVA 27%'])
      + parseMontoAR(raw['IVA 5%']) + parseMontoAR(raw['IVA 2,5%']))
    || parseMontoAR(raw['IVA']);

  // Neto gravado: usar total o sumar alícuotas
  const netoGravado = parseMontoAR(raw['Imp. Neto Gravado Total'])
    || parseMontoAR(raw['Imp. Neto Gravado']);

  return {
    fecha: raw['Fecha de Emisión'] || raw['Fecha'] || '',
    tipoCodigo,
    tipoNombre: tipoComprobanteName(tipoCodigo),
    puntoVenta: raw['Punto de Venta'] || '',
    numeroDesde: raw['Número Desde'] || raw['Numero Desde'] || '',
    numeroHasta: raw['Número Hasta'] || raw['Numero Hasta'] || '',
    denominacion: raw['Denominación Receptor'] || raw['Denominación Emisor'] || raw['Denominacion Receptor'] || raw['Denominacion Emisor'] || '',
    nroDoc: raw['Nro. Doc. Receptor'] || raw['Nro. Doc. Emisor'] || '',
    netoGravado,
    netoNoGravado: parseMontoAR(raw['Imp. Neto No Gravado']),
    exento: parseMontoAR(raw['Imp. Op. Exentas']),
    iva,
    otrosTributos: parseMontoAR(raw['Otros Tributos']),
    total: parseMontoAR(raw['Imp. Total']),
    cae: raw['Cód. Autorización'] || raw['Cod. Autorizacion'] || '',
    moneda: raw['Moneda'] || 'PES',
    tipoCambio: parseMontoAR(raw['Tipo Cambio'] || '1'),
  };
}

/**
 * Lee CSVs de un período YYYY-MM desde data/csv/.
 * Retorna { emitidas, recibidas, found }.
 */
function readPeriodo(periodo) {
  const emitidosPath = path.join(CSV_DIR, `${periodo}_emitidos.csv`);
  const recibidosPath = path.join(CSV_DIR, `${periodo}_recibidos.csv`);

  const hasEmitidos = fs.existsSync(emitidosPath);
  const hasRecibidos = fs.existsSync(recibidosPath);

  if (!hasEmitidos && !hasRecibidos) {
    return { emitidas: [], recibidas: [], found: false };
  }

  const emitidas = hasEmitidos
    ? parseCSVFile(emitidosPath).map(normalizeCSVRow)
    : [];
  const recibidas = hasRecibidos
    ? parseCSVFile(recibidosPath).map(normalizeCSVRow)
    : [];

  return { emitidas, recibidas, found: true };
}

/**
 * Calcula posición de IVA completa desde CSVs.
 * Retorna el mismo formato que espera el Dashboard.
 */
function calcularPosicionFromCSV(periodo) {
  const { emitidas, recibidas, found } = readPeriodo(periodo);

  if (!found) {
    return null;
  }

  const [year, month] = periodo.split('-').map(Number);
  const periodoLabel = `${MESES[month - 1]} ${year}`;

  return {
    periodo: periodoLabel,
    resumen: calcularResumenFromComprobantes(emitidas, recibidas),
    emitidas,
    recibidas,
    iva_diario: calcularIvaDiario(emitidas, recibidas),
  };
}

/**
 * Calcula ranking de proveedores por IVA crédito para un período.
 */
function calcularProveedores(periodo) {
  const recibidosPath = path.join(CSV_DIR, `${periodo}_recibidos.csv`);
  if (!fs.existsSync(recibidosPath)) {
    return [];
  }

  const rows = parseCSVFile(recibidosPath).map(normalizeCSVRow);
  const map = {};

  for (const c of rows) {
    const key = c.denominacion || 'SIN DENOMINACION';
    if (!map[key]) {
      map[key] = {
        denominacion: key,
        nroDoc: c.nroDoc,
        ivaTotal: 0,
        netoTotal: 0,
        importeTotal: 0,
        cantidad: 0,
      };
    }
    map[key].ivaTotal += c.iva;
    map[key].netoTotal += c.netoGravado;
    map[key].importeTotal += c.total;
    map[key].cantidad += 1;
  }

  return Object.values(map)
    .map((p) => ({
      ...p,
      ivaTotal: Math.round(p.ivaTotal * 100) / 100,
      netoTotal: Math.round(p.netoTotal * 100) / 100,
      importeTotal: Math.round(p.importeTotal * 100) / 100,
    }))
    .sort((a, b) => b.ivaTotal - a.ivaTotal);
}

/**
 * Guarda un buffer de CSV subido a data/csv/{periodo}_{tipo}.csv.
 */
function saveUploadedCSV(buffer, tipo, periodo) {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  const filename = `${periodo}_${tipo}.csv`;
  const filePath = path.join(CSV_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Escanea data/csv/ y retorna array de períodos YYYY-MM disponibles.
 */
function listPeriodos() {
  fs.mkdirSync(CSV_DIR, { recursive: true });
  const files = fs.readdirSync(CSV_DIR);
  const periodos = new Set();

  for (const f of files) {
    const match = f.match(/^(\d{4}-\d{2})_(emitidos|recibidos)\.csv$/);
    if (match) {
      periodos.add(match[1]);
    }
  }

  return Array.from(periodos).sort().reverse();
}

/**
 * Reads CSVs for a period, computes everything, stores in SQLite, returns full data.
 * This is the main entry point after CSVs are available (from scraper or upload).
 */
function processAndStore(periodo) {
  const { emitidas, recibidas, found } = readPeriodo(periodo);
  if (!found) return null;

  const database = require('./database');

  const [year, month] = periodo.split('-').map(Number);
  const periodoLabel = `${MESES[month - 1]} ${year}`;
  const resumen = calcularResumenFromComprobantes(emitidas, recibidas);

  // Store everything in SQLite (single transaction)
  database.savePeriodo(periodo, periodoLabel, resumen, emitidas, recibidas);

  // Return full data from DB (includes pagination, proveedores, iva_diario)
  return database.getFullPeriodo(periodo);
}

module.exports = {
  parseCSVFile,
  normalizeCSVRow,
  readPeriodo,
  calcularPosicionFromCSV,
  calcularProveedores,
  saveUploadedCSV,
  listPeriodos,
  processAndStore,
};

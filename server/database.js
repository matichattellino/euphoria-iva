const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'euphoria.db');

// Ensure data directory exists
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS periodos (
    id TEXT PRIMARY KEY,
    periodo_label TEXT NOT NULL,
    facturacion_emitida REAL DEFAULT 0,
    facturacion_recibida REAL DEFAULT 0,
    iva_debito REAL DEFAULT 0,
    iva_credito REAL DEFAULT 0,
    posicion_iva REAL DEFAULT 0,
    cantidad_emitidas INTEGER DEFAULT 0,
    cantidad_recibidas INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comprobantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    periodo TEXT NOT NULL,
    tipo_registro TEXT NOT NULL CHECK(tipo_registro IN ('emitido', 'recibido')),
    fecha TEXT,
    tipo_codigo INTEGER,
    tipo_nombre TEXT,
    punto_venta TEXT,
    numero_desde TEXT,
    numero_hasta TEXT,
    denominacion TEXT,
    nro_doc TEXT,
    neto_gravado REAL DEFAULT 0,
    neto_no_gravado REAL DEFAULT 0,
    exento REAL DEFAULT 0,
    iva REAL DEFAULT 0,
    otros_tributos REAL DEFAULT 0,
    total REAL DEFAULT 0,
    cae TEXT,
    moneda TEXT DEFAULT 'PES',
    tipo_cambio REAL DEFAULT 1,
    FOREIGN KEY (periodo) REFERENCES periodos(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_comprobantes_periodo ON comprobantes(periodo);
  CREATE INDEX IF NOT EXISTS idx_comprobantes_tipo ON comprobantes(periodo, tipo_registro);
`);

// --- Prepared statements ---

const stmtInsertPeriodo = db.prepare(`
  INSERT OR REPLACE INTO periodos
    (id, periodo_label, facturacion_emitida, facturacion_recibida,
     iva_debito, iva_credito, posicion_iva,
     cantidad_emitidas, cantidad_recibidas, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

const stmtInsertComprobante = db.prepare(`
  INSERT INTO comprobantes
    (periodo, tipo_registro, fecha, tipo_codigo, tipo_nombre,
     punto_venta, numero_desde, numero_hasta,
     denominacion, nro_doc, neto_gravado, neto_no_gravado,
     exento, iva, otros_tributos, total, cae, moneda, tipo_cambio)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtDeleteComprobantes = db.prepare(`DELETE FROM comprobantes WHERE periodo = ?`);

const stmtGetPeriodo = db.prepare(`SELECT * FROM periodos WHERE id = ?`);

const stmtGetComprobantes = db.prepare(`
  SELECT * FROM comprobantes WHERE periodo = ? AND tipo_registro = ?
  ORDER BY fecha DESC, id DESC
`);

const stmtGetComprobantesPage = db.prepare(`
  SELECT * FROM comprobantes WHERE periodo = ? AND tipo_registro = ?
  ORDER BY fecha DESC, id DESC
  LIMIT ? OFFSET ?
`);

const stmtCountComprobantes = db.prepare(`
  SELECT COUNT(*) as count FROM comprobantes WHERE periodo = ? AND tipo_registro = ?
`);

const stmtGetProveedores = db.prepare(`
  SELECT
    denominacion,
    nro_doc AS nroDoc,
    SUM(iva) AS ivaTotal,
    SUM(neto_gravado) AS netoTotal,
    SUM(total) AS importeTotal,
    COUNT(*) AS cantidad
  FROM comprobantes
  WHERE periodo = ? AND tipo_registro = 'recibido'
  GROUP BY denominacion
  ORDER BY ivaTotal DESC
`);

const stmtListPeriodos = db.prepare(`
  SELECT id, periodo_label, cantidad_emitidas, cantidad_recibidas, updated_at
  FROM periodos ORDER BY id DESC
`);

const stmtGetIvaDiario = db.prepare(`
  SELECT
    substr(fecha, 1, 2) AS dia,
    tipo_registro,
    SUM(iva) AS iva_sum
  FROM comprobantes
  WHERE periodo = ?
  GROUP BY dia, tipo_registro
  ORDER BY dia
`);

// --- Public API ---

function hasPeriodo(periodoId) {
  return !!stmtGetPeriodo.get(periodoId);
}

/**
 * Save a full periodo with all comprobantes in a single transaction.
 */
const savePeriodo = db.transaction((periodoId, periodoLabel, resumen, emitidas, recibidas) => {
  // Upsert periodo
  stmtInsertPeriodo.run(
    periodoId,
    periodoLabel,
    resumen.facturacion_emitida,
    resumen.facturacion_recibida,
    resumen.iva_debito,
    resumen.iva_credito,
    resumen.posicion_iva,
    resumen.cantidad_emitidas,
    resumen.cantidad_recibidas
  );

  // Delete old comprobantes and re-insert
  stmtDeleteComprobantes.run(periodoId);

  for (const c of emitidas) {
    stmtInsertComprobante.run(
      periodoId, 'emitido', c.fecha, c.tipoCodigo, c.tipoNombre,
      c.puntoVenta, c.numeroDesde, c.numeroHasta,
      c.denominacion, c.nroDoc, c.netoGravado, c.netoNoGravado,
      c.exento, c.iva, c.otrosTributos, c.total, c.cae, c.moneda, c.tipoCambio
    );
  }

  for (const c of recibidas) {
    stmtInsertComprobante.run(
      periodoId, 'recibido', c.fecha, c.tipoCodigo, c.tipoNombre,
      c.puntoVenta, c.numeroDesde, c.numeroHasta,
      c.denominacion, c.nroDoc, c.netoGravado, c.netoNoGravado,
      c.exento, c.iva, c.otrosTributos, c.total, c.cae, c.moneda, c.tipoCambio
    );
  }
});

function getPeriodo(periodoId) {
  const row = stmtGetPeriodo.get(periodoId);
  if (!row) return null;

  return {
    id: row.id,
    periodo: row.periodo_label,
    resumen: {
      facturacion_emitida: row.facturacion_emitida,
      facturacion_recibida: row.facturacion_recibida,
      iva_debito: row.iva_debito,
      iva_credito: row.iva_credito,
      posicion_iva: row.posicion_iva,
      cantidad_emitidas: row.cantidad_emitidas,
      cantidad_recibidas: row.cantidad_recibidas,
    },
    updated_at: row.updated_at,
  };
}

/**
 * Get comprobantes with optional pagination.
 */
function getComprobantes(periodoId, tipo, page, pageSize) {
  if (page != null && pageSize != null) {
    const offset = (page - 1) * pageSize;
    const rows = stmtGetComprobantesPage.all(periodoId, tipo, pageSize, offset);
    const { count } = stmtCountComprobantes.get(periodoId, tipo);
    return {
      data: rows.map(rowToComprobante),
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    };
  }
  const rows = stmtGetComprobantes.all(periodoId, tipo);
  return { data: rows.map(rowToComprobante), total: rows.length };
}

function rowToComprobante(row) {
  return {
    fecha: row.fecha,
    tipoCodigo: row.tipo_codigo,
    tipoNombre: row.tipo_nombre,
    puntoVenta: row.punto_venta,
    numeroDesde: row.numero_desde,
    numeroHasta: row.numero_hasta,
    denominacion: row.denominacion,
    nroDoc: row.nro_doc,
    netoGravado: row.neto_gravado,
    netoNoGravado: row.neto_no_gravado,
    exento: row.exento,
    iva: row.iva,
    otrosTributos: row.otros_tributos,
    total: row.total,
    cae: row.cae,
    moneda: row.moneda,
    tipoCambio: row.tipo_cambio,
  };
}

function getProveedores(periodoId) {
  const rows = stmtGetProveedores.all(periodoId);
  return rows.map((r) => ({
    denominacion: r.denominacion,
    nroDoc: r.nroDoc,
    ivaTotal: Math.round(r.ivaTotal * 100) / 100,
    netoTotal: Math.round(r.netoTotal * 100) / 100,
    importeTotal: Math.round(r.importeTotal * 100) / 100,
    cantidad: r.cantidad,
  }));
}

function getIvaDiario(periodoId) {
  const rows = stmtGetIvaDiario.all(periodoId);
  const map = {};
  for (const r of rows) {
    map[r.dia] = map[r.dia] || { dia: r.dia, debito: 0, credito: 0 };
    if (r.tipo_registro === 'emitido') {
      map[r.dia].debito = Math.round(r.iva_sum * 100) / 100;
    } else {
      map[r.dia].credito = Math.round(r.iva_sum * 100) / 100;
    }
  }
  return Object.values(map).sort((a, b) => a.dia.localeCompare(b.dia));
}

function listPeriodos() {
  return stmtListPeriodos.all();
}

/**
 * Full dashboard payload from DB.
 */
function getFullPeriodo(periodoId, emitPage, emitPageSize, recibPage, recibPageSize) {
  const periodo = getPeriodo(periodoId);
  if (!periodo) return null;

  const emitidas = getComprobantes(periodoId, 'emitido', emitPage, emitPageSize);
  const recibidas = getComprobantes(periodoId, 'recibido', recibPage, recibPageSize);
  const proveedores = getProveedores(periodoId);
  const iva_diario = getIvaDiario(periodoId);

  return {
    periodo: periodo.periodo,
    source: 'db',
    resumen: periodo.resumen,
    emitidas: emitidas.data,
    emitidas_pagination: emitidas.total > 0 ? {
      total: emitidas.total,
      page: emitidas.page || 1,
      pageSize: emitidas.pageSize || emitidas.total,
      totalPages: emitidas.totalPages || 1,
    } : null,
    recibidas: recibidas.data,
    recibidas_pagination: recibidas.total > 0 ? {
      total: recibidas.total,
      page: recibidas.page || 1,
      pageSize: recibidas.pageSize || recibidas.total,
      totalPages: recibidas.totalPages || 1,
    } : null,
    proveedores,
    iva_diario,
    updated_at: periodo.updated_at,
  };
}

module.exports = {
  db,
  hasPeriodo,
  savePeriodo,
  getPeriodo,
  getComprobantes,
  getProveedores,
  getIvaDiario,
  getFullPeriodo,
  listPeriodos,
};

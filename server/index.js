console.log('[startup] Initializing server...');
console.log('[startup] DATA_DIR:', process.env.DATA_DIR || '(not set)');
console.log('[startup] PORT:', process.env.PORT || '3001');
console.log('[startup] NODE_ENV:', process.env.NODE_ENV || '(not set)');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
console.log('[startup] Loading services...');
const AfipService = require('./afip-service');
const csvService = require('./csv-service');
const scraperManager = require('./scraper-manager');
const database = require('./database');
console.log('[startup] All services loaded.');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Posición de IVA completa ---
app.post('/api/posicion-iva', async (req, res) => {
  try {
    const { cuit, accessToken, username, password, fechaDesde, fechaHasta } = req.body;

    if (!cuit || !accessToken || !username || !password || !fechaDesde || !fechaHasta) {
      return res.status(400).json({ error: 'Faltan campos requeridos: cuit, accessToken, username, password, fechaDesde, fechaHasta' });
    }

    const service = new AfipService(accessToken);

    const [emitidas, recibidas] = await Promise.all([
      service.getComprobantes('E', cuit, username, password, fechaDesde, fechaHasta),
      service.getComprobantes('R', cuit, username, password, fechaDesde, fechaHasta),
    ]);

    const resultado = service.calcularPosicion(emitidas, recibidas, fechaDesde);
    res.json(resultado);
  } catch (err) {
    console.error('Error en /api/posicion-iva:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Solo emitidas ---
app.post('/api/emitidas', async (req, res) => {
  try {
    const { cuit, accessToken, username, password, fechaDesde, fechaHasta } = req.body;

    if (!cuit || !accessToken || !username || !password || !fechaDesde || !fechaHasta) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const service = new AfipService(accessToken);
    const emitidas = await service.getComprobantes('E', cuit, username, password, fechaDesde, fechaHasta);
    const normalizadas = emitidas.map((c) => service.normalizeComprobante(c));

    res.json({
      cantidad: normalizadas.length,
      total: normalizadas.reduce((s, c) => s + c.total, 0),
      iva_total: normalizadas.reduce((s, c) => s + c.iva, 0),
      comprobantes: normalizadas,
    });
  } catch (err) {
    console.error('Error en /api/emitidas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Solo recibidas ---
app.post('/api/recibidas', async (req, res) => {
  try {
    const { cuit, accessToken, username, password, fechaDesde, fechaHasta } = req.body;

    if (!cuit || !accessToken || !username || !password || !fechaDesde || !fechaHasta) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const service = new AfipService(accessToken);
    const recibidas = await service.getComprobantes('R', cuit, username, password, fechaDesde, fechaHasta);
    const normalizadas = recibidas.map((c) => service.normalizeComprobante(c));

    res.json({
      cantidad: normalizadas.length,
      total: normalizadas.reduce((s, c) => s + c.total, 0),
      iva_total: normalizadas.reduce((s, c) => s + c.iva, 0),
      comprobantes: normalizadas,
    });
  } catch (err) {
    console.error('Error en /api/recibidas:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Comprobante individual vía wsfev1 ---
app.post('/api/comprobante', async (req, res) => {
  try {
    const { cuit, accessToken, numero, puntoVenta, tipoComprobante } = req.body;

    if (!cuit || !accessToken || !numero || !puntoVenta || !tipoComprobante) {
      return res.status(400).json({ error: 'Faltan campos requeridos: cuit, accessToken, numero, puntoVenta, tipoComprobante' });
    }

    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip({
      CUIT: parseInt(cuit, 10),
      access_token: accessToken,
      production: process.env.AFIP_ENVIRONMENT === 'prod',
    });

    const info = await afip.ElectronicBilling.getVoucherInfo(
      parseInt(numero, 10),
      parseInt(puntoVenta, 10),
      parseInt(tipoComprobante, 10)
    );

    res.json(info);
  } catch (err) {
    console.error('Error en /api/comprobante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Consulta de padrón ARCA (datos del contribuyente) ---
app.post('/api/padron', async (req, res) => {
  try {
    const { cuit, accessToken, cuitConsulta } = req.body;
    const target = cuitConsulta || cuit;

    if (!cuit || !accessToken || !target) {
      return res.status(400).json({ error: 'Faltan campos requeridos: cuit, accessToken' });
    }

    const Afip = require('@afipsdk/afip.js');
    const afip = new Afip({
      CUIT: parseInt(String(cuit).replace(/-/g, ''), 10),
      access_token: accessToken,
      production: process.env.AFIP_ENVIRONMENT === 'prod',
    });

    // Padrón alcance 5 - datos básicos
    let datosA5 = null;
    try {
      datosA5 = await afip.RegisterScopeFive.getTaxpayerDetails(
        parseInt(String(target).replace(/-/g, ''), 10)
      );
    } catch (e) {
      console.log('Padron A5 no disponible:', e.message);
    }

    // Padrón alcance 10 - datos extendidos
    let datosA10 = null;
    try {
      datosA10 = await afip.RegisterScopeTen.getTaxpayerDetails(
        parseInt(String(target).replace(/-/g, ''), 10)
      );
    } catch (e) {
      console.log('Padron A10 no disponible:', e.message);
    }

    // Padrón alcance 13 - datos completos
    let datosA13 = null;
    try {
      datosA13 = await afip.RegisterScopeThirteen.getTaxpayerDetails(
        parseInt(String(target).replace(/-/g, ''), 10)
      );
    } catch (e) {
      console.log('Padron A13 no disponible:', e.message);
    }

    // Combinar la mejor data disponible
    const raw = datosA13 || datosA10 || datosA5;
    if (!raw) {
      return res.status(404).json({ error: 'No se encontraron datos para el CUIT consultado' });
    }

    // Normalizar respuesta
    const persona = raw.datosGenerales || raw;
    const domicilio = raw.domicilioFiscal || persona.domicilioFiscal || {};
    const actividades = raw.datosRegimenGeneral?.actividad || raw.actividad || [];
    const impuestos = raw.datosRegimenGeneral?.impuesto || raw.impuesto || [];
    const regimenes = raw.datosRegimenGeneral?.regimen || raw.regimen || [];
    const monotributo = raw.datosMonotributo || null;

    const result = {
      cuit: target,
      // Datos generales
      razonSocial: persona.razonSocial || persona.nombre || persona.apellido
        ? `${persona.apellido || ''} ${persona.nombre || ''}`.trim()
        : 'N/D',
      tipoPersona: persona.tipoPersona || 'N/D',
      estadoClave: persona.estadoClave || persona.estadoCUIT || 'N/D',
      fechaInscripcion: persona.fechaInscripcion || null,
      // Domicilio fiscal
      domicilio: {
        direccion: domicilio.direccion || domicilio.calle || 'N/D',
        localidad: domicilio.localidad || domicilio.descripcionProvincia || 'N/D',
        provincia: domicilio.descripcionProvincia || domicilio.idProvincia || 'N/D',
        codigoPostal: domicilio.codPostal || domicilio.codigoPostal || 'N/D',
      },
      // Actividades económicas
      actividades: (Array.isArray(actividades) ? actividades : [actividades]).filter(Boolean).map((a) => ({
        codigo: a.idActividad || a.codigo || '',
        descripcion: a.descripcionActividad || a.descripcion || '',
        orden: a.orden || 0,
      })),
      // Impuestos inscriptos
      impuestos: (Array.isArray(impuestos) ? impuestos : [impuestos]).filter(Boolean).map((i) => ({
        id: i.idImpuesto || i.id || '',
        descripcion: i.descripcionImpuesto || i.descripcion || '',
        estado: i.estado || '',
        periodo: i.periodo || '',
      })),
      // Regímenes
      regimenes: (Array.isArray(regimenes) ? regimenes : [regimenes]).filter(Boolean).map((r) => ({
        id: r.idRegimen || r.id || '',
        descripcion: r.descripcionRegimen || r.descripcion || '',
        tipo: r.tipoRegimen || '',
        estado: r.estado || '',
        periodo: r.periodo || '',
      })),
      // Monotributo (si aplica)
      monotributo: monotributo ? {
        categoria: monotributo.categoriaMonotributo?.descripcionCategoria || null,
        actividad: monotributo.actividadMonotributista?.descripcionActividad || null,
      } : null,
      // Data cruda para debug
      _raw: raw,
    };

    res.json(result);
  } catch (err) {
    console.error('Error en /api/padron:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Posición de IVA (DB-first, CSV fallback) ---
app.get('/api/iva/:periodo', (req, res) => {
  try {
    const { periodo } = req.params;
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: 'Formato de período inválido. Usar YYYY-MM' });
    }

    const page = parseInt(req.query.page, 10) || undefined;
    const pageSize = parseInt(req.query.pageSize, 10) || undefined;
    const tab = req.query.tab; // 'emitidas' or 'recibidas' for paginated fetch

    // 1. Check SQLite first
    if (database.hasPeriodo(periodo)) {
      const result = database.getFullPeriodo(
        periodo,
        tab !== 'recibidas' ? page : undefined,
        tab !== 'recibidas' ? pageSize : undefined,
        tab === 'recibidas' ? page : undefined,
        tab === 'recibidas' ? pageSize : undefined
      );
      return res.json(result);
    }

    // 2. Check CSV files, process and store in DB
    const result = csvService.processAndStore(periodo);
    if (result) {
      return res.json(result);
    }

    // 3. No data found
    return res.status(404).json({ error: 'No hay datos para este período' });
  } catch (err) {
    console.error('Error en /api/iva/:periodo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Lista de períodos disponibles (DB + CSV) ---
app.get('/api/periodos', (_req, res) => {
  try {
    const dbPeriodos = database.listPeriodos().map((p) => p.id);
    const csvPeriodos = csvService.listPeriodos();
    const all = [...new Set([...dbPeriodos, ...csvPeriodos])].sort().reverse();
    res.json({ periodos: all });
  } catch (err) {
    console.error('Error en /api/periodos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Upload de CSVs ---
app.post('/api/upload', upload.fields([
  { name: 'emitidos', maxCount: 1 },
  { name: 'recibidos', maxCount: 1 },
]), (req, res) => {
  try {
    const periodo = req.body.periodo;
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: 'Falta campo "periodo" con formato YYYY-MM' });
    }

    const saved = [];
    if (req.files.emitidos && req.files.emitidos[0]) {
      const p = csvService.saveUploadedCSV(req.files.emitidos[0].buffer, 'emitidos', periodo);
      saved.push(p);
    }
    if (req.files.recibidos && req.files.recibidos[0]) {
      const p = csvService.saveUploadedCSV(req.files.recibidos[0].buffer, 'recibidos', periodo);
      saved.push(p);
    }

    if (saved.length === 0) {
      return res.status(400).json({ error: 'No se recibió ningún archivo CSV' });
    }

    // Auto-process into SQLite
    const result = csvService.processAndStore(periodo);
    res.json({ ok: true, saved, data: result });
  } catch (err) {
    console.error('Error en /api/upload:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Scraper: lanzar ---
app.post('/api/scraper/run', (req, res) => {
  try {
    const { periodo, fechaDesde, fechaHasta } = req.body;
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: 'Falta campo "periodo" con formato YYYY-MM' });
    }
    scraperManager.runScraper(periodo, fechaDesde, fechaHasta);
    res.json({ ok: true, status: scraperManager.getStatus() });
  } catch (err) {
    console.error('Error en /api/scraper/run:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// --- Scraper: estado ---
app.get('/api/scraper/status', (_req, res) => {
  res.json(scraperManager.getStatus());
});

// --- Ranking de proveedores por IVA crédito ---
app.get('/api/proveedores/:periodo', (req, res) => {
  try {
    const { periodo } = req.params;
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: 'Formato de período inválido. Usar YYYY-MM' });
    }
    // DB first, CSV fallback
    let proveedores;
    if (database.hasPeriodo(periodo)) {
      proveedores = database.getProveedores(periodo);
    } else {
      proveedores = csvService.calcularProveedores(periodo);
    }
    res.json({ proveedores });
  } catch (err) {
    console.error('Error en /api/proveedores/:periodo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Servir frontend en producción ---
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Euphoria IVA server running on port ${PORT}`);
});

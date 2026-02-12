const { spawn } = require('child_process');
const path = require('path');

const SCRAPER_PATH = path.resolve(__dirname, '..', 'src', 'scraper', 'arca-scraper.js');

let state = {
  status: 'idle', // 'idle' | 'running' | 'done' | 'error'
  periodo: null,
  startedAt: null,
  finishedAt: null,
  error: null,
  output: [],
};

/**
 * Lanza el scraper como proceso hijo para un período YYYY-MM.
 * Opcionalmente recibe fechaDesde/fechaHasta (DD/MM/YYYY) para rango parcial.
 * Solo permite un scraper a la vez.
 * On success, auto-processes CSVs and stores in SQLite.
 */
function runScraper(periodo, fechaDesde, fechaHasta) {
  if (state.status === 'running') {
    throw new Error('Ya hay un scraper en ejecución');
  }

  state = {
    status: 'running',
    periodo,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    output: [],
  };

  const args = [SCRAPER_PATH, '--periodo', periodo];
  if (fechaDesde) args.push('--desde', fechaDesde);
  if (fechaHasta) args.push('--hasta', fechaHasta);

  const child = spawn('node', args, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    state.output.push(...lines);
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    state.output.push(...lines);
  });

  child.on('close', (code) => {
    state.finishedAt = new Date().toISOString();
    if (code === 0) {
      // Auto-process CSVs into SQLite
      try {
        const csvService = require('./csv-service');
        csvService.processAndStore(periodo);
        state.status = 'done';
        state.output.push('[server] CSVs procesados y guardados en base de datos');
      } catch (err) {
        state.status = 'error';
        state.error = `CSVs descargados pero error al procesar: ${err.message}`;
      }
    } else {
      state.status = 'error';
      state.error = `Scraper terminó con código ${code}`;
    }
  });

  child.on('error', (err) => {
    state.finishedAt = new Date().toISOString();
    state.status = 'error';
    state.error = err.message;
  });
}

/**
 * Retorna copia del estado actual del scraper.
 */
function getStatus() {
  return { ...state, output: [...state.output] };
}

module.exports = { runScraper, getStatus };

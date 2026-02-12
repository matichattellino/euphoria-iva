import { useState, useRef, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import ConfigPanel from './components/ConfigPanel';
import DateRangePicker from './components/DateRangePicker';
import DataSourceBar from './components/DataSourceBar';
import CuitInfo from './components/CuitInfo';
import { mockData, generateMockData } from './utils/mockData';

function fechaToPeriodo(fechaDesde) {
  const parts = fechaDesde.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}`;
}

export default function App() {
  const [data, setData] = useState(mockData);
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState('demo'); // 'demo' | 'csv' | 'arca'
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [fechaDesde, setFechaDesde] = useState('01/01/2026');
  const [fechaHasta, setFechaHasta] = useState('31/01/2026');
  const [proveedores, setProveedores] = useState(null);
  const [scraperStatus, setScraperStatus] = useState(null);
  const [scraping, setScraping] = useState(false);

  const credentialsRef = useRef(null);
  const scraperPollRef = useRef(null);

  /**
   * Load data from backend for a periodo.
   * Returns the data if found, null if 404.
   */
  const loadPeriodo = useCallback(async (periodo) => {
    try {
      const res = await fetch(`/api/iva/${periodo}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        setDataSource(result.source === 'db' ? 'csv' : 'csv');
        setProveedores(result.proveedores || null);
        setLastUpdate(new Date());
        return result;
      }
      if (res.status === 404) return null;
      let errMsg = 'Error al cargar datos';
      try {
        const err = await res.json();
        errMsg = err.error || errMsg;
      } catch {
        // Response body not valid JSON
      }
      throw new Error(errMsg);
    } catch (e) {
      if (e.message.includes('Failed to fetch')) return null; // Server not available
      throw e;
    }
  }, []);

  /**
   * Launch the scraper for a periodo and poll until done.
   */
  const launchScraper = useCallback(async (periodo, desde, hasta) => {
    setScraping(true);
    setScraperStatus({ status: 'running', periodo });
    setError(null);

    try {
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo, fechaDesde: desde, fechaHasta: hasta }),
      });
      if (!res.ok) {
        let errMsg = 'Error al lanzar scraper';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch {
          // Response body not valid JSON
        }
        throw new Error(errMsg);
      }

      // Poll until done
      return new Promise((resolve, reject) => {
        if (scraperPollRef.current) clearInterval(scraperPollRef.current);

        scraperPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch('/api/scraper/status');
            if (!statusRes.ok) return;
            const status = await statusRes.json();
            setScraperStatus(status);

            if (status.status === 'done') {
              clearInterval(scraperPollRef.current);
              scraperPollRef.current = null;
              setScraping(false);
              resolve('done');
            } else if (status.status === 'error') {
              clearInterval(scraperPollRef.current);
              scraperPollRef.current = null;
              setScraping(false);
              reject(new Error(status.error || 'Scraper fallo'));
            }
          } catch {
            // Ignore transient poll errors
          }
        }, 3000);
      });
    } catch (e) {
      setScraping(false);
      setScraperStatus({ status: 'error', error: e.message });
      throw e;
    }
  }, []);

  /**
   * Main flow: select a period.
   * 1. Try DB/CSV via GET /api/iva/:periodo
   * 2. If no data, show mock — user can click "Consultar ARCA" to scrape
   */
  const selectPeriodo = useCallback(async (desde, hasta) => {
    const periodo = fechaToPeriodo(desde);
    if (!periodo) {
      setData(generateMockData(desde, hasta));
      setDataSource('demo');
      setProveedores(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loadPeriodo(periodo);
      if (result) {
        setLoading(false);
        return;
      }

      // No data found — show mock, user can scrape manually
      setData(generateMockData(desde, hasta));
      setDataSource('demo');
      setProveedores(null);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setData(generateMockData(desde, hasta));
      setDataSource('demo');
      setProveedores(null);
      setLoading(false);
    }
  }, [loadPeriodo]);

  // Auto-load on mount
  useEffect(() => {
    selectPeriodo(fechaDesde, fechaHasta);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (scraperPollRef.current) clearInterval(scraperPollRef.current);
    };
  }, []);

  // --- ARCA live connection (via ConfigPanel) ---
  const fetchData = async (creds, desde, hasta) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/posicion-iva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, fechaDesde: desde, fechaHasta: hasta }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al consultar ARCA');
      }
      const result = await res.json();
      setData(result);
      setDataSource('arca');
      setProveedores(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (credentials) => {
    const { fechaDesde: fd, fechaHasta: fh, ...creds } = credentials;
    credentialsRef.current = creds;
    setFechaDesde(fd);
    setFechaHasta(fh);
    await fetchData(creds, fd, fh);
    setShowConfig(false);
  };

  const handleDateChange = async (desde, hasta) => {
    setFechaDesde(desde);
    setFechaHasta(hasta);

    if (dataSource === 'arca' && credentialsRef.current) {
      await fetchData(credentialsRef.current, desde, hasta);
    } else {
      await selectPeriodo(desde, hasta);
    }
  };

  const handleUpload = async () => {
    const periodo = fechaToPeriodo(fechaDesde);
    if (periodo) {
      await loadPeriodo(periodo);
    }
  };

  const handleScraperRun = async () => {
    const periodo = fechaToPeriodo(fechaDesde);
    if (!periodo) return;
    try {
      await launchScraper(periodo, fechaDesde, fechaHasta);
      await loadPeriodo(periodo);
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePageChange = async (tab, page) => {
    const periodo = fechaToPeriodo(fechaDesde);
    if (!periodo) return;
    try {
      const res = await fetch(`/api/iva/${periodo}?tab=${tab}&page=${page}&pageSize=50`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch {
      // Ignore
    }
  };

  const currentPeriodo = fechaToPeriodo(fechaDesde) || '';
  const isWorking = loading || scraping;

  return (
    <div className="min-h-screen bg-[#020617]">
      {/* Header */}
      <header className="border-b border-dark-700 bg-dark-800/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center font-bold text-white text-lg">
              E
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white leading-tight">Euphoria</h1>
              <p className="text-xs text-slate-500 leading-tight">Posicion de IVA</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isWorking && (
              <span className="flex items-center gap-2 text-xs text-blue-400">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {scraping ? 'Descargando comprobantes de ARCA...' : 'Cargando...'}
              </span>
            )}

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                dataSource === 'arca'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : dataSource === 'csv'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === 'arca'
                    ? 'bg-emerald-400'
                    : dataSource === 'csv'
                    ? 'bg-blue-400'
                    : 'bg-amber-400'
                }`}
              />
              {dataSource === 'arca' ? 'Conectado' : dataSource === 'csv' ? 'Cache DB' : 'Demo'}
            </span>

            <button
              onClick={() => setShowConfig(true)}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
            >
              Configurar
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-4">&times;</button>
          </div>
        )}

        {/* Date range picker */}
        <div className="mb-4">
          <DateRangePicker
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
            onChange={handleDateChange}
          />
        </div>

        {/* Data source bar */}
        <div className="mb-6">
          <DataSourceBar
            periodo={currentPeriodo}
            dataSource={dataSource}
            onUpload={handleUpload}
            onScraperRun={handleScraperRun}
            scraperStatus={scraperStatus}
          />
        </div>

        <Dashboard
          data={data}
          proveedores={proveedores}
          onPageChange={handlePageChange}
        />

        {/* Consulta de padron ARCA */}
        <div className="mt-6">
          <CuitInfo credentials={dataSource === 'arca' ? credentialsRef.current : null} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-700 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            {lastUpdate
              ? `Ultima actualizacion: ${lastUpdate.toLocaleString('es-AR')}`
              : 'Datos de demostracion'}
          </span>
          <span>Powered by Afip SDK</span>
        </div>
      </footer>

      {/* Config panel */}
      {showConfig && (
        <ConfigPanel
          onConnect={handleConnect}
          onClose={() => setShowConfig(false)}
          loading={loading}
          defaultFechaDesde={fechaDesde}
          defaultFechaHasta={fechaHasta}
        />
      )}
    </div>
  );
}

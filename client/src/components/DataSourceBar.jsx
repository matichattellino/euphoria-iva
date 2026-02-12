import { useState, useRef } from 'react';

export default function DataSourceBar({ periodo, dataSource, onUpload, onScraperRun, scraperStatus }) {
  const [uploading, setUploading] = useState(false);
  const emitidosRef = useRef(null);
  const recibidosRef = useRef(null);

  const handleUpload = async () => {
    const emitidosFile = emitidosRef.current?.files[0];
    const recibidosFile = recibidosRef.current?.files[0];

    if (!emitidosFile && !recibidosFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('periodo', periodo);
      if (emitidosFile) formData.append('emitidos', emitidosFile);
      if (recibidosFile) formData.append('recibidos', recibidosFile);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir CSV');
      }

      // Reset inputs
      if (emitidosRef.current) emitidosRef.current.value = '';
      if (recibidosRef.current) recibidosRef.current.value = '';

      onUpload();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const scraperRunning = scraperStatus?.status === 'running';

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4 flex flex-wrap items-center gap-4">
      {/* Upload CSV */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">CSV:</span>
        <label className="cursor-pointer px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white transition-colors">
          Emitidos
          <input
            ref={emitidosRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={() => {}}
          />
        </label>
        <label className="cursor-pointer px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white transition-colors">
          Recibidos
          <input
            ref={recibidosRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={() => {}}
          />
        </label>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-lg text-xs text-white font-medium transition-colors"
        >
          {uploading ? 'Subiendo...' : 'Subir'}
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-dark-600 hidden sm:block" />

      {/* Scraper */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Scraper:</span>
        <button
          onClick={onScraperRun}
          disabled={scraperRunning}
          className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 disabled:bg-dark-700/50 disabled:cursor-not-allowed border border-dark-600 rounded-lg text-xs text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
        >
          {scraperRunning && (
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {scraperRunning ? 'Consultando...' : 'Consultar ARCA'}
        </button>
        {scraperStatus?.status === 'done' && (
          <span className="text-xs text-emerald-400">Listo</span>
        )}
        {scraperStatus?.status === 'error' && (
          <span className="text-xs text-red-400" title={scraperStatus.error}>Error</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Data source badge */}
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
        {dataSource === 'arca' ? 'Conectado' : dataSource === 'csv' ? 'CSV' : 'Demo'}
      </span>
    </div>
  );
}

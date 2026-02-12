import { useState } from 'react';

export default function ConfigPanel({ onConnect, onClose, loading, defaultFechaDesde, defaultFechaHasta }) {
  const [form, setForm] = useState({
    cuit: '',
    username: '',
    password: '',
    accessToken: '',
    fechaDesde: defaultFechaDesde || '01/01/2026',
    fechaHasta: defaultFechaHasta || '31/01/2026',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onConnect(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Conectar a ARCA</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">CUIT</label>
            <input
              type="text"
              name="cuit"
              value={form.cuit}
              onChange={handleChange}
              placeholder="20XXXXXXXXX"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Usuario ARCA</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="20XXXXXXXXX"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Contraseña ARCA</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Access Token (Afip SDK)</label>
            <input
              type="text"
              name="accessToken"
              value={form.accessToken}
              onChange={handleChange}
              placeholder="Token de app.afipsdk.com"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Desde</label>
              <input
                type="text"
                name="fechaDesde"
                value={form.fechaDesde}
                onChange={handleChange}
                placeholder="01/02/2026"
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Hasta</label>
              <input
                type="text"
                name="fechaHasta"
                value={form.fechaHasta}
                onChange={handleChange}
                placeholder="28/02/2026"
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Consultando ARCA...
              </span>
            ) : (
              'Conectar'
            )}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-4 text-center">
          Las credenciales no se almacenan en el servidor.
        </p>
      </div>
    </div>
  );
}

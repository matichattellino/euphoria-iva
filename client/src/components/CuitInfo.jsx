import { useState } from 'react';

function InfoRow({ label, value }) {
  if (!value || value === 'N/D') return null;
  return (
    <div className="flex justify-between py-2 border-b border-dark-700/50 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function Badge({ text, color }) {
  const colors = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    yellow: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    slate: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color] || colors.slate}`}>
      {text}
    </span>
  );
}

function estadoColor(estado) {
  const s = (estado || '').toUpperCase();
  if (s === 'ACTIVO' || s === 'ACTIVE') return 'green';
  if (s === 'INACTIVO' || s === 'INACTIVE') return 'red';
  return 'yellow';
}

export default function CuitInfo({ credentials }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cuitBuscar, setCuitBuscar] = useState('');
  const [expanded, setExpanded] = useState({ actividades: false, impuestos: false, regimenes: false });

  const consultar = async (cuitTarget) => {
    if (!credentials) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/padron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: credentials.cuit,
          accessToken: credentials.accessToken,
          cuitConsulta: cuitTarget || credentials.cuit,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al consultar padrón');
      }

      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-dark-700">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Consulta de Padrón ARCA</h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={cuitBuscar}
            onChange={(e) => setCuitBuscar(e.target.value)}
            placeholder={credentials ? 'CUIT a consultar (vacío = propio)' : 'Conectá a ARCA primero'}
            disabled={!credentials}
            className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono disabled:opacity-50"
            onKeyDown={(e) => e.key === 'Enter' && consultar(cuitBuscar)}
          />
          <button
            onClick={() => consultar(cuitBuscar)}
            disabled={!credentials || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              'Consultar'
            )}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-xs mt-2">{error}</p>
        )}
      </div>

      {/* Resultado */}
      {data && (
        <div className="p-5 space-y-4">
          {/* Datos principales */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white">{data.razonSocial}</p>
              <p className="text-sm font-mono text-slate-400 mt-0.5">CUIT: {data.cuit}</p>
            </div>
            <Badge
              text={data.estadoClave}
              color={estadoColor(data.estadoClave)}
            />
          </div>

          {/* Info general */}
          <div className="bg-dark-700/40 rounded-xl p-4">
            <InfoRow label="Tipo de persona" value={data.tipoPersona} />
            <InfoRow label="Fecha de inscripción" value={data.fechaInscripcion} />
            <InfoRow label="Dirección" value={data.domicilio?.direccion} />
            <InfoRow label="Localidad" value={data.domicilio?.localidad} />
            <InfoRow label="Provincia" value={data.domicilio?.provincia} />
            <InfoRow label="Código Postal" value={data.domicilio?.codigoPostal} />
            {data.monotributo && (
              <>
                <InfoRow label="Categoría Monotributo" value={data.monotributo.categoria} />
                <InfoRow label="Actividad Monotributo" value={data.monotributo.actividad} />
              </>
            )}
          </div>

          {/* Actividades */}
          {data.actividades?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('actividades')}
                className="flex items-center justify-between w-full text-left py-2"
              >
                <span className="text-sm font-medium text-slate-300">
                  Actividades económicas ({data.actividades.length})
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expanded.actividades ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded.actividades && (
                <div className="space-y-1.5 mt-1">
                  {data.actividades.map((a, i) => (
                    <div key={i} className="bg-dark-700/40 rounded-lg px-3 py-2 flex items-start gap-3">
                      <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded shrink-0">
                        {a.codigo}
                      </span>
                      <span className="text-sm text-slate-300">{a.descripcion}</span>
                      {a.orden === 1 && <Badge text="Principal" color="blue" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Impuestos */}
          {data.impuestos?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('impuestos')}
                className="flex items-center justify-between w-full text-left py-2"
              >
                <span className="text-sm font-medium text-slate-300">
                  Impuestos inscriptos ({data.impuestos.length})
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expanded.impuestos ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded.impuestos && (
                <div className="space-y-1.5 mt-1">
                  {data.impuestos.map((imp, i) => (
                    <div key={i} className="bg-dark-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-slate-500 shrink-0">#{imp.id}</span>
                        <span className="text-sm text-slate-300 truncate">{imp.descripcion}</span>
                      </div>
                      {imp.estado && (
                        <Badge text={imp.estado} color={estadoColor(imp.estado)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regímenes */}
          {data.regimenes?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('regimenes')}
                className="flex items-center justify-between w-full text-left py-2"
              >
                <span className="text-sm font-medium text-slate-300">
                  Regímenes ({data.regimenes.length})
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expanded.regimenes ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded.regimenes && (
                <div className="space-y-1.5 mt-1">
                  {data.regimenes.map((r, i) => (
                    <div key={i} className="bg-dark-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-mono text-slate-500 shrink-0">#{r.id}</span>
                        <span className="text-sm text-slate-300 truncate">{r.descripcion}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.tipo && <span className="text-xs text-slate-500">{r.tipo}</span>}
                        {r.estado && <Badge text={r.estado} color={estadoColor(r.estado)} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {!data && !loading && !error && (
        <div className="p-8 text-center text-slate-500 text-sm">
          {credentials
            ? 'Ingresá un CUIT o dejá vacío para consultar el propio'
            : 'Conectá a ARCA desde "Configurar" para consultar el padrón'}
        </div>
      )}
    </div>
  );
}

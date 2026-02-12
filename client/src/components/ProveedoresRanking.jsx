import { formatMoney } from '../utils/format';

export default function ProveedoresRanking({ proveedores }) {
  if (!proveedores || proveedores.length === 0) return null;

  const maxIva = proveedores[0]?.ivaTotal || 1;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-600">
        <h3 className="text-sm font-medium text-white">Ranking de Proveedores por IVA Credito</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-dark-600">
              <th className="text-left px-4 py-3 font-medium w-8">#</th>
              <th className="text-left px-4 py-3 font-medium">Proveedor</th>
              <th className="text-left px-4 py-3 font-medium">CUIT</th>
              <th className="text-right px-4 py-3 font-medium">Comp.</th>
              <th className="text-right px-4 py-3 font-medium">Neto</th>
              <th className="text-right px-4 py-3 font-medium">IVA (Credito)</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p, i) => {
              const pct = maxIva > 0 ? (p.ivaTotal / maxIva) * 100 : 0;
              return (
                <tr
                  key={i}
                  className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-500 font-mono">{i + 1}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">
                    {p.denominacion}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                    {p.nroDoc}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-400">
                    {p.cantidad}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-300">
                    {formatMoney(p.netoTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400 font-medium">
                    {formatMoney(p.ivaTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white font-medium">
                    {formatMoney(p.importeTotal)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-full bg-dark-700 rounded-full h-2">
                      <div
                        className="bg-emerald-500/60 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { formatMoney } from '../utils/format';

export default function GaugeChart({ debito, credito }) {
  const total = debito + Math.abs(credito);
  const isEmpty = total === 0;
  const debitoPercent = total > 0 ? (debito / total) * 100 : 0;
  const creditoPercent = total > 0 ? (Math.abs(credito) / total) * 100 : 0;

  // SVG arc para gauge semicircular
  const radius = 80;
  const circumference = Math.PI * radius; // semicírculo
  const debitoArc = (debitoPercent / 100) * circumference;
  const creditoArc = (creditoPercent / 100) * circumference;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6">
      <h3 className="text-sm font-medium text-slate-400 mb-4">Proporcion Debito / Credito</h3>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <p className="text-sm">Sin datos para graficar</p>
          <p className="text-xs mt-1">Consulta un periodo con comprobantes</p>
        </div>
      ) : (
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[280px]">
          {/* Fondo del arco */}
          <path
            d="M 10 110 A 90 90 0 0 1 190 110"
            fill="none"
            stroke="#1e293b"
            strokeWidth="16"
            strokeLinecap="round"
          />
          {/* Arco débito (rojo) - desde la izquierda */}
          <path
            d="M 10 110 A 90 90 0 0 1 190 110"
            fill="none"
            stroke="#ef4444"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${debitoArc} ${circumference}`}
          />
          {/* Arco crédito (verde) - desde la derecha */}
          <path
            d="M 190 110 A 90 90 0 0 0 10 110"
            fill="none"
            stroke="#10b981"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${creditoArc} ${circumference}`}
          />
          {/* Texto central */}
          <text x="100" y="85" textAnchor="middle" className="fill-white text-lg font-bold" style={{ fontSize: '14px' }}>
            {debitoPercent.toFixed(0)}% / {creditoPercent.toFixed(0)}%
          </text>
          <text x="100" y="105" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '10px' }}>
            Debito vs Credito
          </text>
        </svg>

        <div className="flex gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-slate-400">Debito</span>
            <span className="text-white font-mono font-semibold">{formatMoney(debito)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-slate-400">Credito</span>
            <span className="text-white font-mono font-semibold">{formatMoney(credito)}</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

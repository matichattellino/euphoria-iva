import { formatMoney } from '../utils/format';
import GaugeChart from './GaugeChart';
import DailyChart from './DailyChart';
import ComprobantesTable from './ComprobantesTable';
import ProveedoresRanking from './ProveedoresRanking';

function SummaryCard({ label, value, sub, color, large }) {
  const colorClasses = {
    white: 'from-slate-800/80 to-slate-900/80 border-slate-700/50',
    red: 'from-red-950/40 to-dark-800 border-red-900/30',
    green: 'from-emerald-950/40 to-dark-800 border-emerald-900/30',
    blue: 'from-blue-950/40 to-dark-800 border-blue-900/30',
    dynamic: '',
  };

  const textColors = {
    white: 'text-white',
    red: 'text-red-400',
    green: 'text-emerald-400',
    blue: 'text-blue-400',
  };

  let cardClass = colorClasses[color] || colorClasses.white;
  let textColor = textColors[color] || textColors.white;

  if (color === 'dynamic') {
    const numVal = typeof value === 'number' ? value : 0;
    if (numVal > 0) {
      cardClass = 'from-red-950/40 to-dark-800 border-red-900/30';
      textColor = 'text-red-400';
    } else {
      cardClass = 'from-emerald-950/40 to-dark-800 border-emerald-900/30';
      textColor = 'text-emerald-400';
    }
  }

  const displayValue = typeof value === 'number' ? formatMoney(value) : value;

  return (
    <div className={`bg-gradient-to-br ${cardClass} border rounded-2xl p-5 ${large ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`${large ? 'text-3xl' : 'text-2xl'} font-bold font-mono ${textColor}`}>{displayValue}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ data, proveedores, onPageChange }) {
  const { resumen, emitidas, recibidas, iva_diario, periodo, emitidas_pagination, recibidas_pagination } = data;
  const posLabel = resumen.posicion_iva > 0 ? 'Saldo a pagar' : 'Saldo a favor';

  const ratio = resumen.iva_debito > 0
    ? Math.round((resumen.iva_credito / resumen.iva_debito) * 1000) / 10
    : 0;

  return (
    <div className="space-y-6">
      {/* Periodo */}
      <p className="text-slate-400 text-sm">
        Periodo: <span className="text-white font-medium">{periodo}</span>
      </p>

      {/* Cards de resumen — 2 rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="IVA Debito Fiscal"
          value={resumen.iva_debito}
          sub={`${resumen.cantidad_emitidas} comprobantes emitidos`}
          color="red"
        />
        <SummaryCard
          label="IVA Credito Fiscal"
          value={resumen.iva_credito}
          sub={`${resumen.cantidad_recibidas} comprobantes recibidos`}
          color="green"
        />
        <SummaryCard
          label="IVA A Pagar"
          value={resumen.posicion_iva}
          sub={posLabel}
          color="dynamic"
          large
        />
        <SummaryCard
          label="Ratio Credito/Debito"
          value={`${ratio}%`}
          sub={ratio >= 100 ? 'Saldo a favor' : `Cubre ${ratio}% del debito`}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          label="Facturacion Emitida"
          value={resumen.facturacion_emitida}
          sub={`${resumen.cantidad_emitidas} comprobantes`}
          color="white"
        />
        <SummaryCard
          label="Facturacion Recibida"
          value={resumen.facturacion_recibida}
          sub={`${resumen.cantidad_recibidas} comprobantes`}
          color="white"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GaugeChart debito={resumen.iva_debito} credito={resumen.iva_credito} />
        <DailyChart data={iva_diario} />
      </div>

      {/* Tabla de comprobantes */}
      <ComprobantesTable
        emitidas={emitidas}
        recibidas={recibidas}
        emitidasPagination={emitidas_pagination}
        recibidasPagination={recibidas_pagination}
        onPageChange={onPageChange}
      />

      {/* Ranking de proveedores */}
      <ProveedoresRanking proveedores={proveedores} />
    </div>
  );
}

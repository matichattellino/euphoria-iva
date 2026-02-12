import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatMoney } from '../utils/format';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 shadow-xl">
      <p className="text-slate-400 text-xs mb-2">Día {label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-mono" style={{ color: entry.color }}>
          {entry.name}: {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
};

export default function DailyChart({ data }) {
  const isEmpty = !data || data.length === 0;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6">
      <h3 className="text-sm font-medium text-slate-400 mb-4">IVA Diario</h3>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500" style={{ height: 240 }}>
          <p className="text-sm">Sin datos para graficar</p>
          <p className="text-xs mt-1">Consulta un periodo con comprobantes</p>
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2}>
          <XAxis
            dataKey="dia"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="debito" name="Débito" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="credito" name="Crédito" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}

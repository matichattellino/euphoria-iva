import { useState, useEffect } from 'react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function lastDay(month, year) {
  return new Date(year, month, 0).getDate();
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function DateRangePicker({ fechaDesde, fechaHasta, onChange }) {
  // Parse initial values to detect current month/year
  const parseFromDDMMYYYY = (str) => {
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    return { dia: parseInt(parts[0], 10), mes: parseInt(parts[1], 10), anio: parseInt(parts[2], 10) };
  };

  const parsed = parseFromDDMMYYYY(fechaDesde);
  const [selectedMonth, setSelectedMonth] = useState(parsed ? parsed.mes : 1);
  const [selectedYear, setSelectedYear] = useState(parsed ? parsed.anio : 2026);
  const [mode, setMode] = useState('month'); // 'month' o 'custom'
  const [customDesde, setCustomDesde] = useState(fechaDesde);
  const [customHasta, setCustomHasta] = useState(fechaHasta);

  // Cuando cambia mes/año en modo mensual
  useEffect(() => {
    if (mode === 'month') {
      const desde = `01/${pad(selectedMonth)}/${selectedYear}`;
      const hasta = `${lastDay(selectedMonth, selectedYear)}/${pad(selectedMonth)}/${selectedYear}`;
      onChange(desde, hasta);
    }
  }, [selectedMonth, selectedYear, mode]);

  const handleCustomApply = () => {
    if (customDesde && customHasta) {
      onChange(customDesde, customHasta);
    }
  };

  const currentMonthIdx = new Date().getMonth(); // 0-indexed
  const months2026 = MESES.slice(0, currentMonthIdx + 1);

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setMode('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'month'
              ? 'bg-blue-600 text-white'
              : 'bg-dark-700 text-slate-400 hover:text-white'
          }`}
        >
          Por mes
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            mode === 'custom'
              ? 'bg-blue-600 text-white'
              : 'bg-dark-700 text-slate-400 hover:text-white'
          }`}
        >
          Personalizado
        </button>
      </div>

      {mode === 'month' ? (
        <div>
          {/* Year selector */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600 transition-colors"
            >
              &lsaquo;
            </button>
            <span className="text-sm font-semibold text-white min-w-[50px] text-center">{selectedYear}</span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600 transition-colors"
            >
              &rsaquo;
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {MESES.map((mes, i) => {
              const mesNum = i + 1;
              const isSelected = mesNum === selectedMonth && selectedYear === selectedYear;
              return (
                <button
                  key={mes}
                  onClick={() => setSelectedMonth(mesNum)}
                  className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    mesNum === selectedMonth
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'bg-dark-700 text-slate-400 hover:text-white hover:bg-dark-600'
                  }`}
                >
                  {mes.slice(0, 3)}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Periodo: {pad(1)}/{pad(selectedMonth)}/{selectedYear} — {lastDay(selectedMonth, selectedYear)}/{pad(selectedMonth)}/{selectedYear}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Desde</label>
              <input
                type="text"
                value={customDesde}
                onChange={(e) => setCustomDesde(e.target.value)}
                placeholder="dd/mm/yyyy"
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Hasta</label>
              <input
                type="text"
                value={customHasta}
                onChange={(e) => setCustomHasta(e.target.value)}
                placeholder="dd/mm/yyyy"
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
            <button
              onClick={handleCustomApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              Aplicar
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Formato: dd/mm/yyyy</p>
        </div>
      )}
    </div>
  );
}

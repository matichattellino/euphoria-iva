import { useState } from 'react';
import { formatMoney, tipoColor } from '../utils/format';

const PAGE_SIZE = 50;

export default function ComprobantesTable({
  emitidas,
  recibidas,
  emitidasPagination,
  recibidasPagination,
  onPageChange,
}) {
  const [tab, setTab] = useState('emitidas');
  const data = tab === 'emitidas' ? emitidas : recibidas;
  const pagination = tab === 'emitidas' ? emitidasPagination : recibidasPagination;

  // Client-side pagination fallback when no server pagination
  const [clientPage, setClientPage] = useState(1);
  const useServerPagination = pagination && pagination.totalPages > 1;

  let displayData = data;
  let currentPage = 1;
  let totalPages = 1;
  let totalCount = data.length;

  if (useServerPagination) {
    displayData = data;
    currentPage = pagination.page;
    totalPages = pagination.totalPages;
    totalCount = pagination.total;
  } else if (data.length > PAGE_SIZE) {
    totalPages = Math.ceil(data.length / PAGE_SIZE);
    currentPage = Math.min(clientPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    displayData = data.slice(start, start + PAGE_SIZE);
    totalCount = data.length;
  }

  const totales = data.reduce(
    (acc, c) => ({
      neto: acc.neto + c.netoGravado,
      iva: acc.iva + c.iva,
      total: acc.total + c.total,
    }),
    { neto: 0, iva: 0, total: 0 }
  );

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setClientPage(1);
  };

  const handlePageChange = (newPage) => {
    if (useServerPagination && onPageChange) {
      onPageChange(tab, newPage);
    } else {
      setClientPage(newPage);
    }
  };

  const emitCount = emitidasPagination?.total || emitidas.length;
  const recibCount = recibidasPagination?.total || recibidas.length;

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-2xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-dark-600">
        <button
          onClick={() => handleTabChange('emitidas')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            tab === 'emitidas'
              ? 'text-white border-b-2 border-blue-500 bg-dark-700/50'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Emitidos ({emitCount})
        </button>
        <button
          onClick={() => handleTabChange('recibidas')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            tab === 'recibidas'
              ? 'text-white border-b-2 border-blue-500 bg-dark-700/50'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Recibidos ({recibCount})
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <svg className="w-12 h-12 mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm font-medium">No hay comprobantes para este periodo</p>
            <p className="text-xs mt-1">Consulta ARCA o subi un CSV para cargar datos</p>
          </div>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-dark-600">
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Tipo</th>
              <th className="text-left px-4 py-3 font-medium">Numero</th>
              <th className="text-left px-4 py-3 font-medium">
                {tab === 'emitidas' ? 'Cliente' : 'Proveedor'}
              </th>
              <th className="text-right px-4 py-3 font-medium">Neto</th>
              <th className="text-right px-4 py-3 font-medium">IVA</th>
              <th className="text-right px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((c, i) => (
              <tr
                key={i}
                className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-slate-300">{c.fecha}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tipoColor(c.tipoCodigo)}`}>
                    {c.tipoNombre}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {c.puntoVenta}-{c.numeroDesde}
                </td>
                <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">
                  {c.denominacion}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {formatMoney(c.netoGravado)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {formatMoney(c.iva)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white font-medium">
                  {formatMoney(c.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-dark-600 bg-dark-700/30">
              <td colSpan="4" className="px-4 py-3 font-semibold text-slate-300">
                Totales ({totalCount} comprobantes)
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                {formatMoney(totales.neto)}
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                {formatMoney(totales.iva)}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold text-white">
                {formatMoney(totales.total)}
              </td>
            </tr>
          </tfoot>
        </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-600">
          <span className="text-xs text-slate-500">
            Pagina {currentPage} de {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed border border-dark-600 rounded text-slate-300 transition-colors"
            >
              &laquo;
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed border border-dark-600 rounded text-slate-300 transition-colors"
            >
              &lsaquo;
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (currentPage <= 3) {
                page = i + 1;
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = currentPage - 2 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-2.5 py-1 text-xs border rounded transition-colors ${
                    page === currentPage
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-dark-700 hover:bg-dark-600 border-dark-600 text-slate-300'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed border border-dark-600 rounded text-slate-300 transition-colors"
            >
              &rsaquo;
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 disabled:opacity-30 disabled:cursor-not-allowed border border-dark-600 rounded text-slate-300 transition-colors"
            >
              &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

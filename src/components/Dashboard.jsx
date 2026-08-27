import { useState } from 'react';
import { AlertTriangle, X, ChevronDown, ImageOff } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { euro, hasVariants } from '../lib/helpers';

// Dashboard migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica y props que la
// version anterior en App.jsx -- solo cambio el markup/estilos (Tailwind + Card/Badge
// en vez de estilos inline + baseStyles). Field/SectionTitle locales de aca abajo son
// intencionalmente propios de esta pantalla (no los .mt-* compartidos) para no atar el
// look nuevo al viejo mientras el resto de las pantallas todavia no esta migrado.

function SectionTitle({ children }) {
  return <div className="text-[11.5px] font-extrabold uppercase tracking-wide text-slate-400 mt-6 mb-2.5">{children}</div>;
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function KpiCard({ label, value, accentClass = 'text-foreground' }) {
  return (
    <Card className="flex-1 min-w-[160px] p-[18px_18px_16px]">
      <div className="text-[11px] font-semibold text-muted-foreground mb-2">{label}</div>
      <div className={`font-heading text-[25px] font-bold tracking-[-0.4px] ${accentClass}`}>{value}</div>
    </Card>
  );
}

function BarChart({ data, colorClass = 'bg-primary', valueFormat = (v) => v, height = 150 }) {
  const clean = data.filter((d) => d.value > 0);
  if (clean.length === 0) return <p className="text-muted-foreground text-xs">Todavía no hay datos para graficar.</p>;
  const max = Math.max(1, ...clean.map((d) => d.value));
  return (
    <div className="flex items-end gap-4 overflow-x-auto px-1" style={{ height }}>
      {clean.map((d, i) => (
        <div key={i} className="flex flex-col items-center min-w-[46px] flex-none">
          <span className="text-[10.5px] text-foreground mb-1 whitespace-nowrap">{valueFormat(d.value)}</span>
          <div className={`w-[30px] rounded-t ${colorClass}`} style={{ height: Math.max(3, (d.value / max) * (height - 46)) }} />
          <span className="text-[10px] text-muted-foreground mt-1.5 whitespace-nowrap">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ movements }) {
  const byDate = {};
  movements.filter((m) => m.type === 'venta').forEach((m) => {
    byDate[m.date] = (byDate[m.date] || 0) + Number(m.amount);
  });
  const data = Object.entries(byDate)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-21)
    .map(([date, value]) => ({ label: date.slice(5).replace('-', '/'), value }));

  if (data.length === 0) return <p className="text-muted-foreground text-xs">Todavía no hay ventas registradas para graficar la tendencia.</p>;
  return <BarChart data={data} colorClass="bg-primary" valueFormat={euro} height={140} />;
}

export function Dashboard({ stats, totalRecaudado, totalVendido, totalInvertido, totalStock, totalStockDeposito, lowStock, locations, movements }) {
  const restaurantes = locations.filter((l) => l.type === 'restaurante');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedIds, setExpandedIds] = useState({});
  const dateFilterActive = !!(dateFrom || dateTo);

  const filteredMovements = dateFilterActive
    ? movements.filter((m) => (!dateFrom || m.date >= dateFrom) && (!dateTo || m.date <= dateTo))
    : movements;

  const filteredStats = stats.map((p) => {
    const pm = filteredMovements.filter((m) => m.productId === p.id);
    const vendido = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
    const recaudado = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
    const fallada = pm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
    const regalada = pm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
    const variantRows = hasVariants(p) ? (p.variantStats || []).map((v) => {
      const vm = pm.filter((m) => m.variantId === v.id);
      return {
        ...v,
        vendido: vm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0),
        recaudado: vm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0),
        fallada: vm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0),
        regalada: vm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0),
      };
    }) : null;
    return { ...p, vendido, recaudado, fallada, regalada, variantRows };
  });

  const totalRecaudadoFiltered = dateFilterActive ? filteredStats.reduce((s, p) => s + p.recaudado, 0) : totalRecaudado;
  const totalVendidoFiltered = dateFilterActive ? filteredStats.reduce((s, p) => s + p.vendido, 0) : totalVendido;

  return (
    <div className="font-sans">
      <Card className="p-3 mb-4">
        <div className="flex gap-2.5 flex-wrap items-end">
          <Field label="Desde"><input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          {dateFilterActive && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="flex items-center gap-1.5 bg-destructive-bg border border-destructive-border text-destructive rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              <X size={13} /> Quitar filtro
            </button>
          )}
        </div>
        {dateFilterActive && (
          <p className="text-muted-foreground text-[11.5px] mt-2 mb-0">
            Recaudado, vendido y los desgloses por producto y por punto de venta muestran solo este rango. Stock restante y las alertas de stock bajo siempre reflejan el estado real actual.
          </p>
        )}
      </Card>

      <div className="flex gap-3 flex-wrap mb-5">
        <KpiCard label="Recaudado" value={euro(totalRecaudadoFiltered)} accentClass="text-success" />
        <KpiCard label="Vendido (uds)" value={totalVendidoFiltered} />
        <KpiCard label="Invertido" value={euro(totalInvertido)} accentClass="text-warning" />
        <KpiCard label="Stock restante" value={totalStock} />
        <KpiCard label="Stock en depósito" value={totalStockDeposito} />
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 bg-destructive-bg border border-destructive-border rounded-lg px-3.5 py-2.5 mb-5">
          <AlertTriangle size={15} className="text-destructive shrink-0" />
          <span className="text-[12.5px] text-destructive font-semibold">
            Stock bajo en depósito: {lowStock.map((p) => `${p.name} (${p.stockDeposito})`).join(', ')}
          </span>
        </div>
      )}

      <SectionTitle>Por producto</SectionTitle>
      <Card className="p-0 overflow-x-auto mb-6">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {['', 'Producto', 'Categoría', 'Stock', 'Stock depósito', 'Vendido', 'Recaudado', '% Recuperado', 'Falladas', 'Regaladas'].map((h) => (
                <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-3.5 py-2.5 border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((p) => {
              const pct = Number(p.invested) > 0 ? (p.recaudado / Number(p.invested)) * 100 : null;
              const isExpanded = !!expandedIds[p.id];
              return (
                <>
                  <tr key={p.id} className="hover:bg-muted">
                    <td className="w-5 px-3.5 py-2.5 border-b border-border">
                      {hasVariants(p) && (
                        <button
                          type="button"
                          onClick={() => setExpandedIds((e) => ({ ...e, [p.id]: !e[p.id] }))}
                          className="text-muted-foreground hover:text-foreground p-0.5"
                        >
                          <ChevronDown size={13} style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                        </button>
                      )}
                    </td>
                    <td className="font-semibold px-3.5 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2">
                        {p.mockupUrl ? (
                          <img src={p.mockupUrl} alt={p.name} className="w-[26px] h-[26px] object-cover rounded-md border border-border shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <div className="w-[26px] h-[26px] rounded-md border border-border bg-muted flex items-center justify-center shrink-0">
                            <ImageOff size={12} className="text-muted-foreground" />
                          </div>
                        )}
                        <span>{p.name}{hasVariants(p) && <span className="text-muted-foreground text-[10.5px] ml-1.5">({p.variantStats.length} variantes)</span>}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">{p.category}</td>
                    <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{p.stockActual}</td>
                    <td className={`px-3.5 py-2.5 border-b border-border tabular-nums ${p.stockDeposito < (Number(p.lowStockThreshold) || 20) ? 'text-destructive font-bold' : ''}`}>{p.stockDeposito}</td>
                    <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{p.vendido}</td>
                    <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{euro(p.recaudado)}</td>
                    <td className="px-3.5 py-2.5 border-b border-border">
                      {pct === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={`min-w-[34px] ${pct >= 100 ? 'font-bold text-success' : ''}`}>{pct.toFixed(0)}%</span>
                          <div className="w-[50px] h-1.5 rounded bg-muted overflow-hidden shrink-0">
                            <div className={`h-full ${pct >= 100 ? 'bg-success' : 'bg-warning'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{p.fallada}</td>
                    <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{p.regalada}</td>
                  </tr>
                  {isExpanded && (p.variantRows || []).map((v) => (
                    <tr key={v.id} className="bg-muted">
                      <td className="border-b border-border"></td>
                      <td className="text-muted-foreground pl-6 px-3.5 py-2.5 border-b border-border">↳ {v.label}</td>
                      <td className="border-b border-border"></td>
                      <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{v.stockActual}</td>
                      <td className={`px-3.5 py-2.5 border-b border-border tabular-nums ${v.stockDeposito < (Number(v.lowStockThreshold) || Number(p.lowStockThreshold) || 20) ? 'text-destructive' : ''}`}>{v.stockDeposito}</td>
                      <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{v.vendido}</td>
                      <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{euro(v.recaudado)}</td>
                      <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">—</td>
                      <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{v.fallada}</td>
                      <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{v.regalada}</td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Por punto de venta</SectionTitle>
      <div className="flex gap-3 flex-wrap mb-6">
        {restaurantes.map((loc) => {
          const ventas = filteredMovements.filter((m) => m.locationId === loc.id && m.type === 'venta');
          const uds = ventas.reduce((s, m) => s + Number(m.quantity), 0);
          const monto = ventas.reduce((s, m) => s + Number(m.amount), 0);
          return (
            <Card key={loc.id} className="p-[14px_16px] flex-1 min-w-[160px]">
              <div className="font-bold mb-1.5">{loc.name}</div>
              <div className="text-muted-foreground text-xs">{uds} unidades</div>
              <div className="text-[15px] text-success font-semibold">{euro(monto)}</div>
            </Card>
          );
        })}
      </div>

      <SectionTitle>Gráficos</SectionTitle>
      <div className="flex gap-3 flex-wrap mb-6">
        <Card className="p-4 flex-1 min-w-[320px]">
          <div className="text-[10.5px] font-bold uppercase text-slate-400 mb-2.5">Recaudado por producto</div>
          <BarChart data={filteredStats.map((p) => ({ label: p.name, value: p.recaudado }))} colorClass="bg-success" valueFormat={euro} />
        </Card>
        <Card className="p-4 flex-1 min-w-[320px]">
          <div className="text-[10.5px] font-bold uppercase text-slate-400 mb-2.5">Recaudado por punto de venta</div>
          <BarChart
            data={restaurantes.map((loc) => ({
              label: loc.name,
              value: filteredMovements.filter((m) => m.locationId === loc.id && m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0),
            }))}
            colorClass="bg-warning"
            valueFormat={euro}
          />
        </Card>
      </div>

      <Card className="p-4 mb-1">
        <div className="text-[10.5px] font-bold uppercase text-slate-400 mb-2.5">Recaudado por día (ventas)</div>
        <TrendChart movements={filteredMovements} />
      </Card>
    </div>
  );
}

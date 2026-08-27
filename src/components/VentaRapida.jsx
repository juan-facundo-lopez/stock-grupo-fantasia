import { useState, useEffect } from 'react';
import { AlertTriangle, Undo2, Minus, Plus, Zap } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Select } from './shared';
import { euro, uid, fullLabel, hasVariants } from '../lib/helpers';

// Venta rapida migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/props/handlers que
// la version anterior en App.jsx -- solo cambia el markup/estilos. Field local (mismo
// criterio que en el resto de pantallas migradas).

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const QS_LOCATION_KEY = 'merch-tracker-qs-location';
const QS_PERSON_KEY = 'merch-tracker-qs-person';

function VentaRapidaCard({ title, price, stock, qty, onQty, onSell }) {
  const sinStock = stock <= 0;
  return (
    <Card className="p-3.5 flex-1 min-w-[200px]" style={{ opacity: sinStock ? 0.5 : 1 }}>
      <div className="font-bold">{title}</div>
      <div className="text-muted-foreground text-[11px] mb-2.5">{euro(price)} · stock {stock}</div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Button type="button" variant="icon" size="icon" disabled={sinStock} onClick={() => onQty(qty - 1)}><Minus size={13} /></Button>
        <span className="min-w-[20px] text-center font-bold">{qty}</span>
        <Button type="button" variant="icon" size="icon" disabled={sinStock} onClick={() => onQty(qty + 1)}><Plus size={13} /></Button>
      </div>
      <Button type="button" disabled={sinStock} onClick={onSell} className="w-full">
        {sinStock ? 'Sin stock' : <><Zap size={13} /> Vender{qty > 1 ? ` ×${qty}` : ''}</>}
      </Button>
    </Card>
  );
}

export function VentaRapida({ stats, locations, people, movements, onAdd, onUndo, onNavigate }) {
  const restaurantes = locations.filter((l) => l.type === 'restaurante');
  const [locationId, setLocationId] = useState(() => localStorage.getItem(QS_LOCATION_KEY) || '');
  const [personId, setPersonId] = useState(() => localStorage.getItem(QS_PERSON_KEY) || '');
  const [qtyByProduct, setQtyByProduct] = useState({});
  const [flash, setFlash] = useState(null); // { text, movementId }

  useEffect(() => {
    if (locationId) localStorage.setItem(QS_LOCATION_KEY, locationId);
  }, [locationId]);
  useEffect(() => {
    if (personId) localStorage.setItem(QS_PERSON_KEY, personId);
    else localStorage.removeItem(QS_PERSON_KEY);
  }, [personId]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const today = new Date().toISOString().slice(0, 10);
  const setQty = (key, qty) => setQtyByProduct((q) => ({ ...q, [key]: Math.max(1, qty) }));

  // key: para un producto simple es el id del producto; para una variante, el id de la
  // variante puntual (ya es único por sí solo, generado con uid()).
  const registerSale = (product, variant) => {
    if (!locationId) { setFlash({ text: 'Elegí un punto de venta primero.' }); return; }
    const key = variant ? variant.id : product.id;
    const qty = qtyByProduct[key] || 1;
    const price = Number((variant?.priceOverride !== '' && variant?.priceOverride != null ? variant.priceOverride : product.price) || 0);
    const amount = qty * price;
    const movementId = uid();
    onAdd({ id: movementId, productId: product.id, variantId: variant ? variant.id : null, locationId, personId, type: 'venta', quantity: qty, amount, date: today, note: '' });
    setQtyByProduct((q) => ({ ...q, [key]: 1 }));
    setFlash({ text: `Vendido: ${qty} × ${fullLabel(product, variant)} (${euro(amount)})`, movementId });
  };

  return (
    <div className="font-sans">
      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Venta rápida</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Registrá una venta al instante, sin pasar por el formulario largo.</p>
      </div>

      <Card className="p-4 mb-5">
        <div className="flex gap-2.5 flex-wrap items-end">
          <Field label="Punto de venta">
            <Select value={locationId} onChange={setLocationId} options={[{ value: '', label: 'Elegir…' }, ...restaurantes.map((l) => ({ value: l.id, label: l.name }))]} style={{ width: 200 }} />
          </Field>
          <Field label="Quién vende">
            <Select value={personId} onChange={setPersonId} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 160 }} />
          </Field>
        </div>
        <div className="text-muted-foreground text-[11px] mt-2">
          Quedan elegidos hasta que los cambies. Tocá "Vender" en un producto para registrar la venta al instante.
        </div>
      </Card>

      {flash && (
        <div className="flex justify-between items-center gap-2.5 flex-wrap bg-primary-tint border border-[#cfe0fb] text-primary rounded-lg px-3.5 py-2.5 text-[12.5px] mb-4">
          <span>{flash.text}</span>
          {flash.movementId && (
            <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary-tint" onClick={() => { onUndo(flash.movementId); setFlash(null); }}>
              <Undo2 size={12} /> Deshacer
            </Button>
          )}
        </div>
      )}

      {restaurantes.length === 0 ? (
        <div className="flex items-center gap-2.5 flex-wrap bg-warning-bg border border-warning-border text-warning rounded-lg px-3.5 py-2.5 text-[12.5px]">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1 min-w-[200px]">Todavía no cargaste ningún punto de venta — hace falta al menos uno para poder vender.</span>
          <Button type="button" variant="destructiveOutline" size="sm" className="border-warning text-warning hover:bg-warning-bg" onClick={() => onNavigate('ubicaciones')}>
            Ir a Puntos de venta
          </Button>
        </div>
      ) : !locationId ? (
        <p className="text-muted-foreground text-[13px]">Elegí un punto de venta arriba para empezar a vender.</p>
      ) : stats.length === 0 ? (
        <div className="flex items-center gap-2.5 flex-wrap bg-warning-bg border border-warning-border text-warning rounded-lg px-3.5 py-2.5 text-[12.5px]">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1 min-w-[200px]">Todavía no cargaste ningún producto — hace falta al menos uno para poder vender.</span>
          <Button type="button" variant="destructiveOutline" size="sm" className="border-warning text-warning hover:bg-warning-bg" onClick={() => onNavigate('productos')}>
            Ir a Productos
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {stats.map((p) => {
            if (hasVariants(p)) {
              if ((p.variantStats || []).length === 0) return null;
              return (
                <div key={p.id}>
                  <div className="text-muted-foreground text-[10.5px] tracking-wide uppercase mb-1.5">{p.name}</div>
                  <div className="flex flex-wrap gap-3">
                    {p.variantStats.map((v) => (
                      <VentaRapidaCard
                        key={v.id}
                        title={v.label}
                        price={v.priceOverride !== '' && v.priceOverride != null ? v.priceOverride : p.price}
                        stock={v.stockActual}
                        qty={qtyByProduct[v.id] || 1}
                        onQty={(q) => setQty(v.id, q)}
                        onSell={() => registerSale(p, v)}
                      />
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div key={p.id} className="flex flex-wrap gap-3">
                <VentaRapidaCard
                  title={p.name}
                  price={p.price}
                  stock={p.stockActual}
                  qty={qtyByProduct[p.id] || 1}
                  onQty={(q) => setQty(p.id, q)}
                  onSell={() => registerSale(p)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

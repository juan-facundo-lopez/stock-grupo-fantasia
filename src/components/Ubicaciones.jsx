import { useState } from 'react';
import { Plus, Pencil, X, ChevronDown, Trash2 } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Select, ListToolbar, ImageUploadField, MapsLink, WhatsAppLink, useConfirmDialog } from './shared';
import {
  euro, fullLabel, hasVariants, variantLabel, getVariantStock, getVariantStockDeposito,
  getProductStock, getProductStockDeposito, LOCATION_TYPE_META, PHONE_COUNTRIES,
} from '../lib/helpers';

// Ubicaciones (Puntos de venta) migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/
// props/handlers que la version anterior en App.jsx -- solo cambia el markup/estilos.
// LocationDetail vive en este mismo archivo (solo lo usa Ubicaciones). typeMeta llega
// como prop (antes era el TYPE_META de modulo en App.jsx).

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const emptyLocationForm = { name: '', type: 'restaurante', logoUrl: '', address: '', email: '', phone: '', phoneCountry: '+54' };

const LOCATION_SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'type', label: 'Tipo (agrupado)' },
];

function LocationDetail({ location, products, movements, people, typeMeta, onClose, onAddMovement, onUpdateMovement, onRemoveMovement }) {
  const lm = movements.filter((m) => m.locationId === location.id);
  const [quick, setQuick] = useState({ productId: products[0]?.id || '', variantId: '', personId: people[0]?.id || '', type: 'entrega', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const [historyOpen, setHistoryOpen] = useState(false);
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const quickProduct = products.find((p) => p.id === quick.productId);
  const quickNeedsVariant = hasVariants(quickProduct);
  const quickVariant = quickNeedsVariant ? (quickProduct.variants || []).find((v) => v.id === quick.variantId) : null;

  const submitQuick = async (e) => {
    e.preventDefault();
    if (!quick.productId || !quick.quantity) return;
    if (quickNeedsVariant && !quick.variantId) return;
    const qty = Number(quick.quantity);
    if (['venta', 'fallada', 'regalada'].includes(quick.type)) {
      const product = products.find((p) => p.id === quick.productId);
      if (product) {
        const currentStock = quickNeedsVariant ? getVariantStock(product, quickVariant, movements) : getProductStock(product, movements);
        if (qty > currentStock) {
          const ok = await askConfirm(`Ojo: esto va a dejar el stock de "${fullLabel(product, quickVariant)}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    if (quick.type === 'entrega') {
      const product = products.find((p) => p.id === quick.productId);
      if (product) {
        const currentDeposito = quickNeedsVariant ? getVariantStockDeposito(product, quickVariant, movements) : getProductStockDeposito(product, movements);
        if (qty > currentDeposito) {
          const ok = await askConfirm(`Ojo: en el depósito quedan ${currentDeposito} de "${fullLabel(product, quickVariant)}" y estás entregando ${qty}. ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    onAddMovement({ productId: quick.productId, variantId: quickNeedsVariant ? quick.variantId : null, locationId: location.id, personId: quick.personId, type: quick.type, quantity: qty, amount: Number(quick.amount) || 0, date: quick.date, note: '' });
    setQuick((f) => ({ ...f, quantity: '', amount: '' }));
  };

  const porProducto = products
    .map((p) => {
      const pm = lm.filter((m) => m.productId === p.id);
      const recibido = pm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
      const vendido = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
      const recaudado = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
      const fallada = pm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
      const regalada = pm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
      return { ...p, recibido, vendido, recaudado, fallada, regalada, total: pm.length };
    })
    .filter((p) => p.total > 0);

  const totalRecaudado = porProducto.reduce((s, p) => s + p.recaudado, 0);
  const totalVendido = porProducto.reduce((s, p) => s + p.vendido, 0);

  return (
    <Card className="p-4">
      {confirmDialog}
      <div className="flex justify-between items-start mb-1.5">
        <div className="flex items-center gap-3">
          {location.logoUrl && (
            <img src={location.logoUrl} alt="" className="w-10 h-10 object-cover rounded-md border border-border shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div>
            <div className="text-muted-foreground text-[10.5px] tracking-wide uppercase">Detalle</div>
            <div className="font-heading text-xl font-bold">{location.name}</div>
            {location.address && (
              <div className="text-muted-foreground text-[11.5px] flex items-center gap-1.5 mt-0.5 flex-wrap">
                {location.address} <MapsLink address={location.address} />
              </div>
            )}
            {(location.email || location.phone) && (
              <div className="text-muted-foreground text-[11.5px] flex items-center gap-2.5 mt-0.5 flex-wrap">
                {location.email && <span>{location.email}</span>}
                {location.phone && <span>{location.phone}</span>}
                <WhatsAppLink phone={location.phone} phoneCountry={location.phoneCountry} />
              </div>
            )}
          </div>
        </div>
        <Button variant="icon" size="icon" onClick={onClose}><X size={16} /></Button>
      </div>
      <div className="h-px my-2.5" style={{ background: 'repeating-linear-gradient(to right, hsl(var(--border)) 0 6px, transparent 6px 11px)' }} />

      <div className="flex gap-5 mb-4">
        <div>
          <div className="text-muted-foreground text-[10.5px] uppercase">Vendido</div>
          <div className="text-base font-semibold">{totalVendido} uds</div>
        </div>
        <div>
          <div className="text-muted-foreground text-[10.5px] uppercase">Recaudado</div>
          <div className="text-base font-semibold text-primary">{euro(totalRecaudado)}</div>
        </div>
      </div>

      <div className="text-muted-foreground text-[10.5px] tracking-wide uppercase mb-2">Agregar producto a {location.name}</div>
      <form onSubmit={submitQuick} className="flex gap-2.5 flex-wrap items-end mb-4 p-3 bg-muted border border-dashed border-border rounded-md">
        <Field label="Producto">
          <Select value={quick.productId} onChange={(v) => setQuick({ ...quick, productId: v, variantId: '' })} options={products.map((p) => ({ value: p.id, label: p.name }))} style={{ width: 160 }} />
        </Field>
        {quickNeedsVariant && (
          <Field label="Variante">
            <Select
              value={quick.variantId}
              onChange={(v) => setQuick({ ...quick, variantId: v })}
              options={[
                { value: '', label: 'Elegir…' },
                ...quickProduct.variants.map((v) => ({ value: v.id, label: `${variantLabel(quickProduct, v)} (stock ${getVariantStock(quickProduct, v, movements)})` })),
              ]}
              style={{ width: 200 }}
            />
          </Field>
        )}
        <Field label="Quién">
          <Select value={quick.personId} onChange={(v) => setQuick({ ...quick, personId: v })} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
        </Field>
        <Field label="Tipo">
          <Select value={quick.type} onChange={(v) => setQuick({ ...quick, type: v })} options={Object.entries(typeMeta).filter(([k]) => k !== 'ingreso').map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 140 }} />
        </Field>
        <Field label="Cantidad">
          <input className="h-9 w-[90px] rounded-md border border-input px-3 text-sm" type="number" min="1" value={quick.quantity} onChange={(e) => setQuick({ ...quick, quantity: e.target.value })} required />
        </Field>
        <Field label="Monto (€)">
          <input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" min="0" step="0.01" value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value })} />
        </Field>
        <Field label="Fecha">
          <input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={quick.date} onChange={(e) => setQuick({ ...quick, date: e.target.value })} />
        </Field>
        <Button type="submit"><Plus size={14} /> Registrar</Button>
      </form>

      {porProducto.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">Todavía no hay movimientos registrados para este local.</p>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {['Producto', 'Recibido', 'Vendido', 'Recaudado', 'Falladas', 'Regaladas'].map((h) => (
                  <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-3.5 py-2.5 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porProducto.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold px-3.5 py-2.5 border-b border-border">{p.name}</td>
                  <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{p.recibido || '—'}</td>
                  <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{p.vendido}</td>
                  <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{euro(p.recaudado)}</td>
                  <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{p.fallada}</td>
                  <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border tabular-nums">{p.regalada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => setHistoryOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left bg-transparent border-none cursor-pointer py-2 text-[10.5px] tracking-wide uppercase text-muted-foreground"
      >
        <ChevronDown size={14} style={{ transform: historyOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        Historial en este local ({lm.length})
      </button>
      {historyOpen && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {['Fecha', 'Producto', 'Quién', 'Tipo', 'Cant.', 'Monto', 'Nota', ''].map((h) => (
                  <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-3.5 py-2.5 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lm.length === 0 && <tr><td colSpan={8} className="text-muted-foreground px-3.5 py-3">Sin movimientos.</td></tr>}
              {lm.map((m) => {
                const prod = products.find((p) => p.id === m.productId);
                const variant = prod?.variants?.find((v) => v.id === m.variantId);
                const person = people.find((u) => u.id === m.personId);
                return (
                  <tr key={m.id}>
                    <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">{m.date}</td>
                    <td className="font-semibold px-3.5 py-2.5 border-b border-border">{fullLabel(prod, variant)}</td>
                    <td className="px-3.5 py-2.5 border-b border-border">{person?.name || '—'}</td>
                    <td className="px-3.5 py-2.5 border-b border-border" style={{ color: typeMeta[m.type]?.color }}>{typeMeta[m.type]?.label}</td>
                    <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{m.quantity}</td>
                    <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{m.amount ? euro(m.amount) : '—'}</td>
                    <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">{m.note || '—'}</td>
                    <td className="px-3.5 py-2.5 border-b border-border"><Button variant="icon" size="icon" onClick={() => onRemoveMovement(m.id)}><Trash2 size={13} /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-muted-foreground text-[10px] mt-2">Para editar un movimiento (no solo borrarlo), hacelo desde el tab Movimientos.</p>
        </div>
      )}
    </Card>
  );
}

export function Ubicaciones({ locations, products, movements, people, typeMeta, onAdd, onUpdate, onRemove, onAddMovement, onUpdateMovement, onRemoveMovement }) {
  const [form, setForm] = useState(emptyLocationForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    if (editingId) {
      onUpdate(editingId, form);
      setEditingId(null);
    } else {
      onAdd(form);
    }
    setForm(emptyLocationForm);
  };

  const startEdit = (l) => {
    setEditingId(l.id);
    setForm({ name: l.name, type: l.type || 'restaurante', logoUrl: l.logoUrl || '', address: l.address || '', email: l.email || '', phone: l.phone || '', phoneCountry: l.phoneCountry || '+54' });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyLocationForm);
  };

  const selected = locations.find((l) => l.id === selectedId) || null;

  const visibleLocations = locations
    .filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'type') {
        const typeCompare = (LOCATION_TYPE_META[a.type]?.label || '').localeCompare(LOCATION_TYPE_META[b.type]?.label || '', 'es');
        if (typeCompare !== 0) return typeCompare;
      }
      return a.name.localeCompare(b.name, 'es');
    });

  return (
    <div className="font-sans">
      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Puntos de venta</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Alta y detalle de cada punto de venta o almacén.</p>
      </div>

      <Card className={`p-4 mb-5 max-w-[520px] ${editingId ? 'border-warning' : ''}`}>
        {editingId && (
          <div className="text-sm font-bold text-warning mb-2.5">
            Editando: {form.name || '—'}
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2.5 flex-wrap items-end">
          <Field label="Nombre"><input className="h-9 rounded-md border border-input px-3 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={Object.entries(LOCATION_TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 150 }} />
          </Field>
          <Field label="Email"><input className="h-9 rounded-md border border-input px-3 text-sm" type="email" placeholder="contacto@ejemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono / WhatsApp">
            <div className="flex gap-1.5">
              <Select value={form.phoneCountry} onChange={(v) => setForm({ ...form, phoneCountry: v })} options={PHONE_COUNTRIES.map((c) => ({ value: c.code, label: c.code || 'Otro' }))} style={{ width: 84 }} />
              <input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 130 }} placeholder="11 5555-5555" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </Field>
          <Field label="Dirección"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 200 }} placeholder="opcional" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <ImageUploadField value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} label="Logo" accept="image/*" />
          <Button type="submit">
            {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Agregar</>}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              <X size={14} /> Cancelar
            </Button>
          )}
        </form>
      </Card>

      {locations.length > 0 && (
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          sortValue={sortBy}
          onSortChange={setSortBy}
          sortOptions={LOCATION_SORT_OPTIONS}
          placeholder="Buscar punto de venta…"
          resultCount={visibleLocations.length}
        />
      )}

      {locations.length > 0 && visibleLocations.length === 0 && (
        <p className="text-muted-foreground text-[13px]">No se encontraron puntos de venta para "{query}".</p>
      )}

      <div className={`flex flex-wrap gap-3 ${selected ? 'mb-5' : ''}`}>
        {visibleLocations.map((l) => {
          const meta = LOCATION_TYPE_META[l.type] || LOCATION_TYPE_META.restaurante;
          const TypeIcon = meta.icon;
          return (
            <Card
              key={l.id}
              onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
              className={`px-4 py-2.5 flex flex-col gap-1 cursor-pointer ${editingId === l.id ? 'border-warning' : selectedId === l.id ? 'border-primary' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                {l.logoUrl ? (
                  <img src={l.logoUrl} alt="" className="w-[22px] h-[22px] object-cover rounded-md border border-border shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <TypeIcon size={15} className="text-primary" />
                )}
                <span className="font-semibold">{l.name}</span>
                <span className="text-muted-foreground text-[11px]">{meta.label}</span>
                <div className="flex gap-0.5 ml-auto">
                  <Button variant="icon" size="icon" onClick={(e) => { e.stopPropagation(); startEdit(l); }}><Pencil size={13} /></Button>
                  <Button variant="icon" size="icon" onClick={(e) => { e.stopPropagation(); onRemove(l.id); }}><X size={13} /></Button>
                </div>
              </div>
              {(l.address || l.phone) && (
                <div onClick={(e) => e.stopPropagation()} className="ml-8 flex gap-3 flex-wrap">
                  <MapsLink address={l.address} />
                  <WhatsAppLink phone={l.phone} phoneCountry={l.phoneCountry} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {selected && (
        <LocationDetail
          location={selected}
          products={products}
          movements={movements}
          people={people}
          typeMeta={typeMeta}
          onClose={() => setSelectedId(null)}
          onAddMovement={onAddMovement}
          onUpdateMovement={onUpdateMovement}
          onRemoveMovement={onRemoveMovement}
        />
      )}
    </div>
  );
}

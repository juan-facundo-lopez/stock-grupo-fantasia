import { useState } from 'react';
import { Plus, Trash2, Pencil, X, AlertTriangle, Download } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Sheet } from './ui/sheet';
import { Select, useConfirmDialog, useUndoToast } from './shared';
import { euro, uid, hasVariants, fullLabel, variantLabel, getVariantStock, getVariantStockDeposito, getProductStock, getProductStockDeposito } from '../lib/helpers';

// Movimientos migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/props/handlers que
// la version anterior en App.jsx -- solo cambia el markup/estilos. Field local (mismo
// criterio que en Dashboard.jsx/Productos.jsx), Select sigue siendo el dropdown animado
// compartido (./shared) porque se usa en muchos lugares de esta pantalla.
//
// Edicion (extendido a esta pantalla, igual criterio que Productos/Proveedores/
// Ubicaciones en los puntos 9 y 12): "Editar" abre un panel lateral (Sheet) en vez de
// resaltar la card + reusar el formulario de alta de arriba. La logica de validacion de
// stock (que compara contra la cantidad anterior cuando se esta editando) se extrajo a
// buildValidatedPayload() para no duplicarla entre alta y edicion.
//
// Deshacer (nuevo): cargar un movimiento nuevo (no editar uno existente) muestra el
// mismo toast de "Deshacer" que ya tenia Venta rapida (useUndoToast, en shared.jsx).

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function exportMovementsCsv(movements, products, locations, people, typeMeta) {
  const header = ['Fecha', 'Producto', 'Ubicación', 'Quién', 'Tipo', 'Cantidad', 'Monto', 'Nota'];
  const rows = movements.map((m) => [
    m.date,
    (() => { const prod = products.find((p) => p.id === m.productId); const variant = prod?.variants?.find((v) => v.id === m.variantId); return prod ? fullLabel(prod, variant) : ''; })(),
    locations.find((l) => l.id === m.locationId)?.name || '',
    people.find((u) => u.id === m.personId)?.name || '',
    typeMeta[m.type]?.label || m.type,
    m.quantity,
    m.amount || 0,
    (m.note || '').replace(/"/g, "'"),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyMovForm = (products, locations, people) => ({
  productId: products[0]?.id || '', variantId: '', locationId: locations[0]?.id || '', personId: people[0]?.id || '',
  type: 'venta', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '',
});

// Campos del formulario, compartidos entre el alta (arriba de la lista) y la edicion
// (dentro del Sheet) -- `setFn` es el setState a usar en cada caso. needsVariant/
// selectedProduct se recalculan a partir de `form` en vez de recibirse como props, para
// no duplicar ese estado derivado entre el formulario de alta y el de edicion.
function MovementFormFields({ form, setFn, data, people, typeMeta }) {
  const selectedProduct = data.products.find((p) => p.id === form.productId);
  const needsVariant = hasVariants(selectedProduct);
  return (
    <>
      <Field label="Producto">
        <Select value={form.productId} onChange={(v) => setFn({ ...form, productId: v, variantId: '' })} options={data.products.map((p) => ({ value: p.id, label: p.name }))} style={{ width: 160 }} />
      </Field>
      {needsVariant && (
        <Field label="Variante">
          <Select
            value={form.variantId}
            onChange={(v) => setFn({ ...form, variantId: v })}
            options={[
              { value: '', label: 'Elegir…' },
              ...selectedProduct.variants.map((v) => ({ value: v.id, label: `${variantLabel(selectedProduct, v)} (stock ${getVariantStock(selectedProduct, v, data.movements)})` })),
            ]}
            style={{ width: 200 }}
          />
        </Field>
      )}
      <Field label="Ubicación">
        <Select value={form.locationId} onChange={(v) => setFn({ ...form, locationId: v })} options={data.locations.map((l) => ({ value: l.id, label: l.name }))} style={{ width: 160 }} />
      </Field>
      <Field label="Quién">
        <Select value={form.personId} onChange={(v) => setFn({ ...form, personId: v })} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
      </Field>
      <Field label="Tipo">
        <Select value={form.type} onChange={(v) => setFn({ ...form, type: v })} options={Object.entries(typeMeta).map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 140 }} />
      </Field>
      <Field label="Cantidad">
        <input className="h-9 w-[90px] rounded-md border border-input px-3 text-sm" type="number" min="1" value={form.quantity} onChange={(e) => setFn({ ...form, quantity: e.target.value })} required />
      </Field>
      <Field label="Monto (€)">
        <input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setFn({ ...form, amount: e.target.value })} />
      </Field>
      <Field label="Fecha">
        <input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={form.date} onChange={(e) => setFn({ ...form, date: e.target.value })} />
      </Field>
      <Field label="Nota">
        <input className="h-9 rounded-md border border-input px-3 text-sm" type="text" placeholder="opcional" value={form.note} onChange={(e) => setFn({ ...form, note: e.target.value })} />
      </Field>
    </>
  );
}

export function Movimientos({ data, people, typeMeta, onAdd, onUpdate, onRemove, onUndo, onNavigate }) {
  const [form, setForm] = useState(() => emptyMovForm(data.products, data.locations, people));
  const [editingId, setEditingId] = useState(null);
  const [selectedMovementId, setSelectedMovementId] = useState(null);
  const [editForm, setEditForm] = useState(() => emptyMovForm(data.products, data.locations, people));
  const [filters, setFilters] = useState({ productId: '', locationId: '', personId: '', type: '', from: '', to: '' });
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();
  const { showUndo, toast } = useUndoToast();

  // Valida stock (con confirmacion si queda negativo) y arma el payload final. Compartido
  // entre alta y edicion -- `editingMovement` es el movimiento original cuando se esta
  // editando (para "devolverle" su cantidad anterior antes de comparar contra el stock
  // actual), o null en el alta. Devuelve null si la validacion no paso o el usuario
  // canceló el aviso de stock negativo.
  const buildValidatedPayload = async (rawForm, editingMovement) => {
    if (!rawForm.productId || !rawForm.quantity) return null;
    const selectedProduct = data.products.find((p) => p.id === rawForm.productId);
    const needsVariant = hasVariants(selectedProduct);
    const selectedVariant = needsVariant ? (selectedProduct.variants || []).find((v) => v.id === rawForm.variantId) : null;
    if (needsVariant && !rawForm.variantId) return null;
    const qty = Number(rawForm.quantity);
    if (['venta', 'fallada', 'regalada'].includes(rawForm.type)) {
      const product = selectedProduct;
      if (product) {
        let currentStock = needsVariant ? getVariantStock(product, selectedVariant, data.movements) : getProductStock(product, data.movements);
        if (editingMovement && editingMovement.productId === rawForm.productId && (editingMovement.variantId || null) === (rawForm.variantId || null) && ['venta', 'fallada', 'regalada'].includes(editingMovement.type)) {
          currentStock += Number(editingMovement.quantity);
        }
        if (qty > currentStock) {
          const ok = await askConfirm(`Ojo: esto va a dejar el stock de "${fullLabel(product, selectedVariant)}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return null;
        }
      }
    }
    if (rawForm.type === 'entrega') {
      const product = selectedProduct;
      if (product) {
        let currentDeposito = needsVariant ? getVariantStockDeposito(product, selectedVariant, data.movements) : getProductStockDeposito(product, data.movements);
        if (editingMovement && editingMovement.productId === rawForm.productId && (editingMovement.variantId || null) === (rawForm.variantId || null) && editingMovement.type === 'entrega') {
          currentDeposito += Number(editingMovement.quantity);
        }
        if (qty > currentDeposito) {
          const ok = await askConfirm(`Ojo: en el depósito quedan ${currentDeposito} de "${fullLabel(product, selectedVariant)}" y estás entregando ${qty}. ¿Confirmás igual?`);
          if (!ok) return null;
        }
      }
    }
    return { ...rawForm, variantId: needsVariant ? rawForm.variantId : null, quantity: qty, amount: Number(rawForm.amount) || 0 };
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    const payload = await buildValidatedPayload(form, null);
    if (!payload) return;
    const movementId = uid();
    onAdd({ id: movementId, ...payload });
    const product = data.products.find((p) => p.id === payload.productId);
    const variant = product?.variants?.find((v) => v.id === payload.variantId);
    showUndo(`Registrado: ${typeMeta[payload.type]?.label} — ${fullLabel(product, variant)} ×${payload.quantity}`, () => onUndo(movementId));
    setForm((f) => ({ ...emptyMovForm(data.products, data.locations, people), productId: f.productId, variantId: '', locationId: f.locationId, personId: f.personId, type: f.type }));
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({ productId: m.productId, variantId: m.variantId || '', locationId: m.locationId, personId: m.personId || '', type: m.type, quantity: String(m.quantity), amount: m.amount ? String(m.amount) : '', date: m.date, note: m.note || '' });
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditForm(emptyMovForm(data.products, data.locations, people));
  };
  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    const editingMovement = data.movements.find((m) => m.id === editingId);
    const payload = await buildValidatedPayload(editForm, editingMovement);
    if (!payload) return;
    onUpdate(editingId, payload);
    closeEdit();
  };

  const filtered = data.movements.filter((m) => {
    if (filters.productId && m.productId !== filters.productId) return false;
    if (filters.locationId && m.locationId !== filters.locationId) return false;
    if (filters.personId && m.personId !== filters.personId) return false;
    if (filters.type && m.type !== filters.type) return false;
    if (filters.from && m.date < filters.from) return false;
    if (filters.to && m.date > filters.to) return false;
    return true;
  });
  const filtersActive = Object.values(filters).some(Boolean);
  const noProducts = data.products.length === 0;
  const noLocations = data.locations.length === 0;

  const editingProduct = data.products.find((p) => p.id === editForm.productId);
  const editingVariant = editingProduct?.variants?.find((v) => v.id === editForm.variantId);

  return (
    <div className="font-sans">
      {confirmDialog}

      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Movimientos</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Historial y carga de entregas, ventas, falladas e ingresos.</p>
      </div>

      {(noProducts || noLocations) && (
        <div className="flex items-center gap-2.5 flex-wrap bg-warning-bg border border-warning-border text-warning rounded-lg px-3.5 py-2.5 text-[12.5px] mb-4">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1 min-w-[200px]">
            Todavía no cargaste {noProducts && noLocations ? 'productos ni puntos de venta' : noProducts ? 'productos' : 'puntos de venta'} — hace falta al menos uno de cada uno para poder registrar movimientos.
          </span>
          <span className="flex gap-2">
            {noProducts && (
              <Button type="button" variant="destructiveOutline" size="sm" className="border-warning text-warning hover:bg-warning-bg" onClick={() => onNavigate('productos')}>
                Ir a Productos
              </Button>
            )}
            {noLocations && (
              <Button type="button" variant="destructiveOutline" size="sm" className="border-warning text-warning hover:bg-warning-bg" onClick={() => onNavigate('ubicaciones')}>
                Ir a Puntos de venta
              </Button>
            )}
          </span>
        </div>
      )}

      {toast}

      <Card className="p-4 mb-5">
        <form onSubmit={submitAdd} className="flex gap-2.5 flex-wrap items-end">
          <MovementFormFields form={form} setFn={setForm} data={data} people={people} typeMeta={typeMeta} />
          <Button type="submit"><Plus size={14} /> Registrar</Button>
        </form>
      </Card>

      <div className="flex justify-between items-center flex-wrap gap-2 mb-2.5">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Historial</span>
        <Button variant="outline" size="sm" onClick={() => exportMovementsCsv(filtered, data.products, data.locations, people, typeMeta)}>
          <Download size={13} /> Exportar CSV ({filtered.length})
        </Button>
      </div>

      <Card className="p-3 mb-3.5">
        <div className="flex gap-2.5 flex-wrap items-end">
          <Field label="Producto">
            <Select value={filters.productId} onChange={(v) => setFilters({ ...filters, productId: v })} options={[{ value: '', label: 'Todos' }, ...data.products.map((p) => ({ value: p.id, label: p.name }))]} style={{ width: 160 }} />
          </Field>
          <Field label="Ubicación">
            <Select value={filters.locationId} onChange={(v) => setFilters({ ...filters, locationId: v })} options={[{ value: '', label: 'Todas' }, ...data.locations.map((l) => ({ value: l.id, label: l.name }))]} style={{ width: 160 }} />
          </Field>
          <Field label="Quién">
            <Select value={filters.personId} onChange={(v) => setFilters({ ...filters, personId: v })} options={[{ value: '', label: 'Todos' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
          </Field>
          <Field label="Tipo">
            <Select value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={[{ value: '', label: 'Todos' }, ...Object.entries(typeMeta).map(([k, v]) => ({ value: k, label: v.label }))]} style={{ width: 140 }} />
          </Field>
          <Field label="Desde"><input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="Hasta"><input className="h-9 rounded-md border border-input px-3 text-sm" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          {filtersActive && (
            <Button variant="destructiveOutline" size="sm" className="bg-destructive-bg" onClick={() => setFilters({ productId: '', locationId: '', personId: '', type: '', from: '', to: '' })}>
              <X size={13} /> Limpiar filtros
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {['Fecha', 'Producto', 'Ubicación', 'Quién', 'Tipo', 'Cant.', 'Monto', 'Nota', ''].map((h) => (
                <th key={h} className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-3.5 py-2.5 border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-muted-foreground px-3.5 py-4">{filtersActive ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos cargados.'}</td></tr>
            )}
            {filtered.map((m) => {
              const prod = data.products.find((p) => p.id === m.productId);
              const variant = prod?.variants?.find((v) => v.id === m.variantId);
              const loc = data.locations.find((l) => l.id === m.locationId);
              const person = people.find((u) => u.id === m.personId);
              return (
                <tr
                  key={m.id}
                  tabIndex={0}
                  aria-selected={selectedMovementId === m.id}
                  onClick={() => setSelectedMovementId(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedMovementId(m.id);
                    }
                  }}
                  className={`cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted ${selectedMovementId === m.id || editingId === m.id ? 'bg-muted' : ''}`}
                >
                  <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">{m.date}</td>
                  <td className="font-semibold px-3.5 py-2.5 border-b border-border">{fullLabel(prod, variant)}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">{loc?.name || '—'}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">{person?.name || '—'}</td>
                  <td className="px-3.5 py-2.5 border-b border-border" style={{ color: typeMeta[m.type]?.color }}>{typeMeta[m.type]?.label}</td>
                  <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{m.quantity}</td>
                  <td className="px-3.5 py-2.5 border-b border-border tabular-nums">{m.amount ? euro(m.amount) : '—'}</td>
                  <td className="text-muted-foreground px-3.5 py-2.5 border-b border-border">{m.note || '—'}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">
                    <div className="flex gap-1">
                      <Button variant="icon" size="icon" onClick={() => startEdit(m)}><Pencil size={13} /></Button>
                      <Button variant="icon" size="icon" onClick={() => onRemove(m.id)}><Trash2 size={13} /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Sheet
        open={!!editingId}
        onClose={closeEdit}
        title={editingProduct ? `Editando: ${fullLabel(editingProduct, editingVariant)}` : 'Editar movimiento'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeEdit}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="edit-movement-form"><Pencil size={14} /> Guardar cambios</Button>
          </>
        }
      >
        <form id="edit-movement-form" onSubmit={submitEdit} className="flex gap-2.5 flex-wrap items-end">
          <MovementFormFields form={editForm} setFn={setEditForm} data={data} people={people} typeMeta={typeMeta} />
        </form>
      </Sheet>
    </div>
  );
}

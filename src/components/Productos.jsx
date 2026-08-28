import { useState, useId } from 'react';
import { Plus, Trash2, Pencil, X, ChevronDown, AlertTriangle, Tags, Mail, ImageOff } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Sheet } from './ui/sheet';
import { ImageUploadField } from './shared';
import { euro, hasVariants, uid, attributeCombos, generateVariants, buildOrderMailto } from '../lib/helpers';

// Productos migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/props/handlers que
// la version anterior en App.jsx (incluida la de variantes, punto 7) -- solo cambia el
// markup/estilos. Field local (igual criterio que en Dashboard.jsx): version propia de
// esta pantalla ya migrada, no la .mt-* compartida que siguen usando las que faltan.
//
// Edicion (punto 9): antes, "Editar" precargaba el mismo formulario de alta (que vive
// arriba de la lista) y resaltaba ese formulario + la card en el color "warning" del
// tema -- que en esta paleta es un rosa/rojo bastante saturado, se confunde con "algo
// esta mal" en vez de "estas editando esto", y ademas obliga a scrollear hasta arriba
// para llegar al formulario. Ahora "Editar" abre un panel lateral (Sheet) con el mismo
// formulario ya precargado, sin mover el scroll de la lista. El formulario de alta y el
// de edicion comparten los mismos campos (ProductFormFields) y los mismos handlers de
// atributos/variantes (reciben que "setFn" usar), asi no hay dos copias del markup.

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const emptyProductForm = { name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20', providerId: '', weight: '', unitsPerPackage: '', mockupUrl: '', attributes: [], variants: [] };

const PRODUCT_SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'stock-low', label: 'Stock bajo primero' },
  { value: 'stock-desc', label: 'Stock actual (mayor a menor)' },
  { value: 'stock-asc', label: 'Stock actual (menor a mayor)' },
];

function sortProductStats(list, sortBy) {
  const withFlags = list.map((p) => ({ ...p, _isLow: p.stockDeposito > 0 && p.stockDeposito < (Number(p.lowStockThreshold) || 20) }));
  switch (sortBy) {
    case 'stock-low':
      return withFlags.sort((a, b) => (b._isLow - a._isLow) || (a.stockDeposito - b.stockDeposito));
    case 'stock-desc':
      return withFlags.sort((a, b) => b.stockActual - a.stockActual);
    case 'stock-asc':
      return withFlags.sort((a, b) => a.stockActual - b.stockActual);
    case 'name':
    default:
      return withFlags.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
}

// --- Handlers de atributos/variantes, genericos sobre que setState usar (setForm del
// alta, o setEditForm del panel de edicion) -- asi no hay que duplicarlos por formulario.
const addAttribute = (setFn) => setFn((f) => ({ ...f, attributes: [...(f.attributes || []), { name: '', options: [] }] }));
const updateAttributeName = (setFn, idx, name) => setFn((f) => ({ ...f, attributes: f.attributes.map((a, i) => (i === idx ? { ...a, name } : a)) }));
const removeAttribute = (setFn, idx) => setFn((f) => ({ ...f, attributes: f.attributes.filter((_, i) => i !== idx) }));
const addAttributeOption = (setFn, idx, option) => setFn((f) => ({
  ...f,
  attributes: f.attributes.map((a, i) => (i === idx && option && !a.options.includes(option) ? { ...a, options: [...a.options, option] } : a)),
}));
const removeAttributeOption = (setFn, idx, option) => setFn((f) => ({
  ...f,
  attributes: f.attributes.map((a, i) => (i === idx ? { ...a, options: a.options.filter((o) => o !== option) } : a)),
}));
const runGenerateVariants = (setFn) => setFn((f) => ({ ...f, variants: generateVariants({ attributes: f.attributes, variants: f.variants }) }));
const updateVariantField = (setFn, variantId, field, value) => setFn((f) => ({ ...f, variants: f.variants.map((v) => (v.id === variantId ? { ...v, [field]: value } : v)) }));
const removeVariantRow = (setFn, variantId) => setFn((f) => ({ ...f, variants: f.variants.filter((v) => v.id !== variantId) }));

function buildProductPayload(form) {
  const cleanAttributes = (form.attributes || []).filter((a) => a.name && (a.options || []).length > 0);
  return {
    name: form.name, category: form.category || 'Merch', price: Number(form.price) || 0, invested: Number(form.invested) || 0,
    initialStock: Number(form.initialStock) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 20,
    providerId: form.providerId, weight: form.weight, unitsPerPackage: form.unitsPerPackage, mockupUrl: form.mockupUrl,
    attributes: cleanAttributes,
    variants: cleanAttributes.length > 0 ? (form.variants || []) : [],
  };
}

function AttributesEditor({ attributes, onAdd, onNameChange, onRemove, onAddOption, onRemoveOption }) {
  const [optionDraft, setOptionDraft] = useState({});

  const submitOption = (idx) => {
    const val = (optionDraft[idx] || '').trim();
    if (!val) return;
    onAddOption(idx, val);
    setOptionDraft((d) => ({ ...d, [idx]: '' }));
  };

  return (
    <div className="basis-full bg-muted border border-dashed border-border rounded-md p-3">
      <div className={`flex items-center justify-between ${attributes.length ? 'mb-2.5' : ''}`}>
        <span className="text-muted-foreground text-[10.5px] tracking-wide uppercase">Atributos (opcional — para productos con variantes)</span>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}><Plus size={12} /> Agregar atributo</Button>
      </div>
      {attributes.map((attr, idx) => (
        <div key={idx} className="flex gap-2 items-start flex-wrap mb-2 p-2 bg-card border border-border rounded-md">
          <input
            className="h-9 w-[130px] rounded-md border border-input px-2.5 text-sm"
            placeholder='Ej. "Color"'
            value={attr.name}
            onChange={(e) => onNameChange(idx, e.target.value)}
          />
          <div className="flex gap-1.5 flex-wrap items-center flex-1 min-w-[180px]">
            {attr.options.map((opt) => (
              <span key={opt} className="inline-flex items-center gap-1 bg-primary-tint text-primary rounded-full px-2 py-0.5 text-[11.5px] font-medium">
                {opt}
                <button type="button" onClick={() => onRemoveOption(idx, opt)} className="bg-transparent border-none cursor-pointer p-0 flex text-inherit"><X size={10} /></button>
              </span>
            ))}
            <input
              className="h-9 w-[110px] rounded-md border border-input px-2.5 text-sm"
              placeholder="+ opción"
              value={optionDraft[idx] || ''}
              onChange={(e) => setOptionDraft((d) => ({ ...d, [idx]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitOption(idx); } }}
              onBlur={() => submitOption(idx)}
            />
          </div>
          <Button type="button" variant="icon" size="icon" onClick={() => onRemove(idx)} title="Quitar atributo"><Trash2 size={13} /></Button>
        </div>
      ))}
    </div>
  );
}

function VariantsEditor({ attributes, variants, onGenerate, onFieldChange, onRemove }) {
  const pendingCombos = attributeCombos(attributes.filter((a) => a.name && a.options.length)).length;
  return (
    <div className="basis-full bg-muted border border-dashed border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <span className="text-muted-foreground text-[10.5px] tracking-wide uppercase">Variantes ({variants.length})</span>
        <Button type="button" size="sm" onClick={onGenerate}><Tags size={12} /> Generar variantes ({pendingCombos} combinaciones)</Button>
      </div>
      {variants.length === 0 ? (
        <p className="text-muted-foreground text-xs m-0">Todavía no generaste variantes para las opciones cargadas arriba.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead><tr>
              {['Variante', 'Stock inicial', 'Umbral (opcional)', 'Precio (opcional)', ''].map((h) => (
                <th key={h} className="text-left text-[10.5px] font-bold uppercase text-muted-foreground px-2.5 py-2 border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold px-2.5 py-2 border-b border-border">{attributes.map((a) => v.attributeValues?.[a.name]).filter(Boolean).join(' / ')}</td>
                  <td className="px-2.5 py-2 border-b border-border"><input className="h-8 w-20 rounded-md border border-input px-2 text-xs" type="number" value={v.initialStock} onChange={(e) => onFieldChange(v.id, 'initialStock', Number(e.target.value) || 0)} /></td>
                  <td className="px-2.5 py-2 border-b border-border"><input className="h-8 w-20 rounded-md border border-input px-2 text-xs" type="number" placeholder="default" value={v.lowStockThreshold ?? ''} onChange={(e) => onFieldChange(v.id, 'lowStockThreshold', e.target.value)} /></td>
                  <td className="px-2.5 py-2 border-b border-border"><input className="h-8 w-[90px] rounded-md border border-input px-2 text-xs" type="number" step="0.01" placeholder="= precio prod." value={v.priceOverride ?? ''} onChange={(e) => onFieldChange(v.id, 'priceOverride', e.target.value)} /></td>
                  <td className="px-2.5 py-2 border-b border-border"><Button type="button" variant="icon" size="icon" onClick={() => onRemove(v.id)}><Trash2 size={13} /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Campos del formulario de producto, compartidos entre el alta (arriba de la lista) y
// la edicion (dentro del Sheet). `setFn` es el setState a usar (setForm o setEditForm);
// `categories` son las categorias ya usadas por otros productos, para el datalist.
function ProductFormFields({ form, setFn, providers, categories }) {
  const hasVariantsFlag = (form.attributes || []).some((a) => a.name && (a.options || []).length > 0);
  const datalistId = useId();

  return (
    <>
      <Field label="Nombre">
        <input className="h-9 rounded-md border border-input px-3 text-sm" value={form.name} onChange={(e) => setFn((f) => ({ ...f, name: e.target.value }))} required />
      </Field>
      <Field label="Categoría">
        <input className="h-9 rounded-md border border-input px-3 text-sm" list={datalistId} value={form.category} onChange={(e) => setFn((f) => ({ ...f, category: e.target.value }))} />
        <datalist id={datalistId}>
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </Field>
      <Field label="Precio unit. (€)"><input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" step="0.01" value={form.price} onChange={(e) => setFn((f) => ({ ...f, price: e.target.value }))} /></Field>
      <Field label="Invertido (€)"><input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" step="0.01" value={form.invested} onChange={(e) => setFn((f) => ({ ...f, invested: e.target.value }))} /></Field>
      {!hasVariantsFlag && (
        <Field label="Stock inicial"><input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" value={form.initialStock} onChange={(e) => setFn((f) => ({ ...f, initialStock: e.target.value }))} /></Field>
      )}
      <Field label={hasVariantsFlag ? 'Alertar si baja de (default)' : 'Alertar si baja de'}>
        <input className="h-9 w-[90px] rounded-md border border-input px-3 text-sm" type="number" value={form.lowStockThreshold} onChange={(e) => setFn((f) => ({ ...f, lowStockThreshold: e.target.value }))} />
      </Field>
      <Field label="Proveedor">
        <select className="h-9 w-[160px] rounded-md border border-input px-3 text-sm bg-card" value={form.providerId} onChange={(e) => setFn((f) => ({ ...f, providerId: e.target.value }))}>
          <option value="">—</option>
          {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </Field>
      <Field label="Peso / medida"><input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" placeholder="ej. 250g" value={form.weight} onChange={(e) => setFn((f) => ({ ...f, weight: e.target.value }))} /></Field>
      <Field label="Uds. por paquete"><input className="h-9 w-[100px] rounded-md border border-input px-3 text-sm" type="number" value={form.unitsPerPackage} onChange={(e) => setFn((f) => ({ ...f, unitsPerPackage: e.target.value }))} /></Field>
      <ImageUploadField value={form.mockupUrl} onChange={(url) => setFn((f) => ({ ...f, mockupUrl: url }))} />

      <div className="basis-full" />
      <AttributesEditor
        attributes={form.attributes || []}
        onAdd={() => addAttribute(setFn)}
        onNameChange={(idx, name) => updateAttributeName(setFn, idx, name)}
        onRemove={(idx) => removeAttribute(setFn, idx)}
        onAddOption={(idx, opt) => addAttributeOption(setFn, idx, opt)}
        onRemoveOption={(idx, opt) => removeAttributeOption(setFn, idx, opt)}
      />

      {hasVariantsFlag && (
        <>
          <div className="basis-full" />
          <VariantsEditor
            attributes={form.attributes}
            variants={form.variants || []}
            onGenerate={() => runGenerateVariants(setFn)}
            onFieldChange={(id, field, val) => updateVariantField(setFn, id, field, val)}
            onRemove={(id) => removeVariantRow(setFn, id)}
          />
        </>
      )}
    </>
  );
}

function PedirMasButton({ product, provider, lowVariants }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');

  if (!open) {
    return (
      <Button type="button" variant="destructiveOutline" className="w-full" onClick={() => setOpen(true)}>
        <Mail size={13} /> Pedir más
      </Button>
    );
  }

  return (
    <div className="bg-muted border border-dashed border-border rounded-md p-2.5">
      {!provider?.email ? (
        <p className="text-muted-foreground text-[11.5px] m-0">Este producto no tiene proveedor con email cargado. Agregalo en la pestaña Proveedores.</p>
      ) : (
        <div className="flex gap-1.5 items-end">
          <Field label="Cantidad">
            <input className="h-9 w-20 rounded-md border border-input px-2.5 text-sm" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <a
            className={`inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold no-underline ${qty ? '' : 'opacity-50 pointer-events-none'}`}
            href={buildOrderMailto(product, provider, qty, lowVariants)}
            onClick={() => setTimeout(() => setOpen(false), 300)}
          >
            <Mail size={13} /> Abrir mail
          </a>
        </div>
      )}
      <Button type="button" variant="ghost" size="sm" className="mt-1.5" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}

export function Productos({ products, stats, providers, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState(emptyProductForm);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [expanded, setExpanded] = useState({});

  // Edicion: vive separada del formulario de alta (antes eran el mismo estado/form) para
  // que "Editar" pueda abrir el Sheet sin tocar lo que se este por ahi cargando en el
  // formulario de arriba.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyProductForm);

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const submitAdd = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd(buildProductPayload(form));
    setForm(emptyProductForm);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name, category: p.category || 'Merch', price: p.price ? String(p.price) : '', invested: p.invested ? String(p.invested) : '',
      initialStock: p.initialStock ? String(p.initialStock) : '', lowStockThreshold: p.lowStockThreshold ? String(p.lowStockThreshold) : '20',
      providerId: p.providerId || '', weight: p.weight || '', unitsPerPackage: p.unitsPerPackage ? String(p.unitsPerPackage) : '', mockupUrl: p.mockupUrl || '',
      attributes: p.attributes || [], variants: p.variants || [],
    });
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditForm(emptyProductForm);
  };
  const submitEdit = (e) => {
    e.preventDefault();
    if (!editForm.name || !editingId) return;
    onUpdate(editingId, buildProductPayload(editForm));
    closeEdit();
  };

  const visibleStats = sortProductStats(stats.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())), sortBy);

  return (
    <div className="font-sans">
      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Productos</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Alta, edición y stock de cada producto.</p>
      </div>

      <Card className="p-4 mb-5">
        <form onSubmit={submitAdd} className="flex gap-2.5 flex-wrap items-end">
          <ProductFormFields form={form} setFn={setForm} providers={providers} categories={categories} />
          <div className="basis-full" />
          <Button type="submit"><Plus size={14} /> Agregar</Button>
        </form>
      </Card>

      <div className="flex gap-2.5 flex-wrap items-end mb-3.5">
        <Field label="Buscar">
          <input className="h-9 w-[220px] rounded-md border border-input px-3 text-sm" placeholder="Buscar producto…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="Ordenar por">
          <select className="h-9 w-[190px] rounded-md border border-input px-3 text-sm bg-card" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {PRODUCT_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {stats.length > 0 && (
          <span className="text-muted-foreground text-[11.5px] pb-2">{visibleStats.length} resultado{visibleStats.length === 1 ? '' : 's'}</span>
        )}
      </div>

      {stats.length > 0 && visibleStats.length === 0 && (
        <p className="text-muted-foreground text-[13px]">No se encontraron productos para "{query}".</p>
      )}

      <div className="flex flex-wrap gap-3">
        {visibleStats.map((p) => {
          const threshold = Number(p.lowStockThreshold) || 20;
          const variantAlerts = hasVariants(p) ? (p.variantStats || []).filter((v) => v.stockDeposito > 0 && v.stockDeposito < (Number(v.lowStockThreshold) || threshold)) : [];
          const isLow = hasVariants(p) ? variantAlerts.length > 0 : (p.stockDeposito > 0 && p.stockDeposito < threshold);
          const movido = Math.max(0, Number(p.initialStock) - p.stockActual);
          const revenueEstimado = movido * Number(p.price || 0);
          const provider = providers.find((pr) => pr.id === p.providerId);
          const isEditing = editingId === p.id;
          return (
            <Card key={p.id} className={`p-[15px] flex-1 min-w-[240px] max-w-[300px] flex flex-col ${isEditing ? 'border-primary ring-2 ring-[rgba(37,99,235,0.15)]' : isLow ? 'border-destructive' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex gap-2">
                  {p.mockupUrl ? (
                    <img src={p.mockupUrl} alt={p.name} className="w-10 h-10 object-cover rounded-md border border-border shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : null}
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      {p.name}
                      {isLow && <AlertTriangle size={13} className="text-destructive" />}
                    </div>
                    <div className="text-muted-foreground text-[11px] flex items-center gap-1.5 flex-wrap mt-0.5">
                      {p.category}
                      {hasVariants(p) && (
                        <Badge variant="blue"><Tags size={10} /> {p.variantStats.length} variante{p.variantStats.length === 1 ? '' : 's'}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  <Button type="button" variant="icon" size="icon" onClick={() => startEdit(p)}><Pencil size={13} /></Button>
                  <Button type="button" variant="icon" size="icon" onClick={() => onRemove(p.id)}><Trash2 size={13} /></Button>
                </div>
              </div>
              <div className="h-px my-2.5" style={{ background: 'repeating-linear-gradient(to right, hsl(var(--border)) 0 6px, transparent 6px 11px)' }} />
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <span className="text-muted-foreground">Precio</span><span>{hasVariants(p) ? 'según variante' : euro(p.price)}</span>
                <span className="text-muted-foreground">Invertido</span><span>{euro(p.invested)}</span>
                {!hasVariants(p) && (<><span className="text-muted-foreground">Stock inicial</span><span>{p.initialStock}</span></>)}
                <span className="text-muted-foreground">Stock actual{hasVariants(p) ? ' (total)' : ''}</span><span>{p.stockActual}</span>
                <span className="text-muted-foreground">Stock en depósito{hasVariants(p) ? ' (total)' : ''}</span><span className={isLow ? 'text-destructive font-bold' : ''}>{p.stockDeposito}</span>
                <span className="text-muted-foreground">Umbral alerta{hasVariants(p) ? ' (default)' : ''}</span><span>{threshold}</span>
                {p.weight && (<><span className="text-muted-foreground">Peso</span><span>{p.weight}</span></>)}
                {p.unitsPerPackage && (<><span className="text-muted-foreground">Uds/paquete</span><span>{p.unitsPerPackage}</span></>)}
                <span className="text-muted-foreground">Proveedor</span><span>{provider?.name || '—'}</span>
              </div>
              {hasVariants(p) && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                    className="flex items-center justify-center gap-1.5 w-full bg-primary-tint border border-[#cfe0fb] text-primary rounded-md cursor-pointer py-1.5 text-[11.5px] font-bold"
                  >
                    <ChevronDown size={13} style={{ transform: expanded[p.id] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    Ver desglose por variante
                  </button>
                  {expanded[p.id] && (
                    <div className="flex flex-col gap-1 mt-1">
                      {p.variantStats.map((v) => {
                        const vLow = v.stockDeposito > 0 && v.stockDeposito < (Number(v.lowStockThreshold) || threshold);
                        return (
                          <div key={v.id} className={`flex justify-between text-[11px] px-1.5 py-1 rounded ${vLow ? 'bg-destructive-bg text-destructive' : 'bg-muted'}`}>
                            <span>{v.label}{vLow && <AlertTriangle size={10} className="ml-1 inline -mt-0.5" />}</span>
                            <span className={vLow ? 'text-destructive' : ''}>{v.stockActual} (dep. {v.stockDeposito})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-auto">
                <div className="h-px my-2.5" style={{ background: 'repeating-linear-gradient(to right, hsl(var(--border)) 0 6px, transparent 6px 11px)' }} />
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Revenue estimado</span>
                  <span className="text-[15px] font-bold text-warning">{euro(revenueEstimado)}</span>
                </div>
                <div className="text-muted-foreground text-[10px] mt-0.5">({movido} uds movidas × {euro(p.price)})</div>
              </div>
              {isLow && <div className="mt-2.5"><PedirMasButton product={p} provider={provider} lowVariants={variantAlerts} /></div>}
            </Card>
          );
        })}
      </div>

      <Sheet
        open={!!editingId}
        onClose={closeEdit}
        title={editForm.name ? `Editando: ${editForm.name}` : 'Editar producto'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeEdit}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="edit-product-form"><Pencil size={14} /> Guardar cambios</Button>
          </>
        }
      >
        <form id="edit-product-form" onSubmit={submitEdit} className="flex gap-2.5 flex-wrap items-end">
          <ProductFormFields form={editForm} setFn={setEditForm} providers={providers} categories={categories} />
        </form>
      </Sheet>
    </div>
  );
}

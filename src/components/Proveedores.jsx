import { useState } from 'react';
import { Plus, Pencil, X, Trash2, Truck } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { ListToolbar, MapsLink } from './shared';

// Proveedores migrado a shadcn/ui (preset b2vP1JgrVi). Ultima pantalla del piloto de
// migracion -- misma logica/props/handlers que la version anterior en App.jsx, solo
// cambia el markup/estilos. Tipo/Telefono usan <input> nativo (como ya se hacia antes),
// sin dropdown animado.

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const emptyProviderForm = { name: '', type: '', email: '', phone: '', address: '', notes: '' };

const PROVIDER_SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'linked-desc', label: 'Más productos asociados primero' },
  { value: 'linked-asc', label: 'Menos productos asociados primero' },
];

export function Proveedores({ providers, products, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState(emptyProviderForm);
  const [editingId, setEditingId] = useState(null);
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
    setForm(emptyProviderForm);
  };

  const startEdit = (pr) => {
    setEditingId(pr.id);
    setForm({ name: pr.name, type: pr.type || '', email: pr.email || '', phone: pr.phone || '', address: pr.address || '', notes: pr.notes || '' });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyProviderForm);
  };

  const visibleProviders = providers
    .map((pr) => ({ ...pr, _linkedCount: products.filter((p) => p.providerId === pr.id).length }))
    .filter((pr) => pr.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'linked-desc') return b._linkedCount - a._linkedCount;
      if (sortBy === 'linked-asc') return a._linkedCount - b._linkedCount;
      return a.name.localeCompare(b.name, 'es');
    });

  return (
    <div className="font-sans">
      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Proveedores</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Alta y datos de contacto de cada proveedor.</p>
      </div>

      <Card className={`p-4 mb-5 max-w-[620px] ${editingId ? 'border-warning' : ''}`}>
        {editingId && (
          <div className="text-sm font-bold text-warning mb-2.5">
            Editando: {form.name || '—'}
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2.5 flex-wrap items-end">
          <Field label="Nombre"><input className="h-9 rounded-md border border-input px-3 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Tipo">
            <input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 130 }} list="tipos-proveedor-existentes" placeholder="ej. imprenta" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <datalist id="tipos-proveedor-existentes">
              {[...new Set(providers.map((pr) => pr.type).filter(Boolean))].map((t) => <option key={t} value={t} />)}
            </datalist>
          </Field>
          <Field label="Email"><input className="h-9 rounded-md border border-input px-3 text-sm" type="email" placeholder="pedidos@proveedor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 130 }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Dirección"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 200 }} placeholder="opcional" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notas"><input className="h-9 rounded-md border border-input px-3 text-sm" placeholder="opcional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
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

      {providers.length > 0 && (
        <ListToolbar
          query={query}
          onQueryChange={setQuery}
          sortValue={sortBy}
          onSortChange={setSortBy}
          sortOptions={PROVIDER_SORT_OPTIONS}
          placeholder="Buscar proveedor…"
          resultCount={visibleProviders.length}
        />
      )}

      {providers.length > 0 && visibleProviders.length === 0 && (
        <p className="text-muted-foreground text-[13px]">No se encontraron proveedores para "{query}".</p>
      )}

      <div className="flex flex-wrap gap-3">
        {providers.length === 0 && <p className="text-muted-foreground text-[13px]">Todavía no hay proveedores cargados.</p>}
        {visibleProviders.map((pr) => {
          const linked = pr._linkedCount;
          return (
            <Card key={pr.id} className={`p-3.5 flex-1 min-w-[220px] flex flex-col ${editingId === pr.id ? 'border-warning' : ''}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <Truck size={15} className="text-primary" />
                  <div>
                    <span className="font-bold">{pr.name}</span>
                    {pr.type && <div className="text-muted-foreground text-[11px]">{pr.type}</div>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="icon" size="icon" onClick={() => startEdit(pr)}><Pencil size={13} /></Button>
                  <Button variant="icon" size="icon" onClick={() => onRemove(pr.id)}><Trash2 size={13} /></Button>
                </div>
              </div>
              <div className="h-px my-2.5" style={{ background: 'repeating-linear-gradient(to right, hsl(var(--border)) 0 6px, transparent 6px 11px)' }} />
              <div className="text-xs flex flex-col gap-0.5">
                <span>{pr.email || <span className="text-muted-foreground">sin email</span>}</span>
                {pr.phone && <span className="text-muted-foreground">{pr.phone}</span>}
                {pr.address && (
                  <span className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    {pr.address} <MapsLink address={pr.address} />
                  </span>
                )}
                {pr.notes && <span className="text-muted-foreground italic">{pr.notes}</span>}
              </div>
              <span className="text-muted-foreground text-xs mt-auto pt-2">{linked} producto{linked === 1 ? '' : 's'} asociado{linked === 1 ? '' : 's'}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

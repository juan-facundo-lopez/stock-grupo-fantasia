import { useId, useState } from 'react';
import { Plus, Pencil, X, Trash2, Truck } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Sheet } from './ui/sheet';
import { ListToolbar, MapsLink } from './shared';

// Proveedores migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/props/handlers que
// la version anterior en App.jsx, solo cambia el markup/estilos. Tipo/Telefono usan
// <input> nativo (como ya se hacia antes), sin dropdown animado.
//
// Edicion (punto 9, extendido a esta pantalla): igual que en Productos, "Editar" abre
// un panel lateral (Sheet) en vez de resaltar la card + reusar el formulario de alta de
// arriba -- mismo motivo (contexto perdido + color de aviso que se leia como error).

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

function buildProviderPayload(form) {
  return { name: form.name, type: form.type, email: form.email, phone: form.phone, address: form.address, notes: form.notes };
}

// Campos del formulario, compartidos entre el alta (arriba de la lista) y la edicion
// (dentro del Sheet) -- `setFn` es el setState a usar en cada caso.
function ProviderFormFields({ form, setFn, providers }) {
  const datalistId = useId();
  return (
    <>
      <Field label="Nombre"><input className="h-9 rounded-md border border-input px-3 text-sm" value={form.name} onChange={(e) => setFn((f) => ({ ...f, name: e.target.value }))} required /></Field>
      <Field label="Tipo">
        <input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 130 }} list={datalistId} placeholder="ej. imprenta" value={form.type} onChange={(e) => setFn((f) => ({ ...f, type: e.target.value }))} />
        <datalist id={datalistId}>
          {[...new Set(providers.map((pr) => pr.type).filter(Boolean))].map((t) => <option key={t} value={t} />)}
        </datalist>
      </Field>
      <Field label="Email"><input className="h-9 rounded-md border border-input px-3 text-sm" type="email" placeholder="pedidos@proveedor.com" value={form.email} onChange={(e) => setFn((f) => ({ ...f, email: e.target.value }))} /></Field>
      <Field label="Teléfono"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 130 }} value={form.phone} onChange={(e) => setFn((f) => ({ ...f, phone: e.target.value }))} /></Field>
      <Field label="Dirección"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 200 }} placeholder="opcional" value={form.address} onChange={(e) => setFn((f) => ({ ...f, address: e.target.value }))} /></Field>
      <Field label="Notas"><input className="h-9 rounded-md border border-input px-3 text-sm" placeholder="opcional" value={form.notes} onChange={(e) => setFn((f) => ({ ...f, notes: e.target.value }))} /></Field>
    </>
  );
}

export function Proveedores({ providers, products, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState(emptyProviderForm);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyProviderForm);

  const submitAdd = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd(buildProviderPayload(form));
    setForm(emptyProviderForm);
  };

  const startEdit = (pr) => {
    setEditingId(pr.id);
    setEditForm({ name: pr.name, type: pr.type || '', email: pr.email || '', phone: pr.phone || '', address: pr.address || '', notes: pr.notes || '' });
  };
  const closeEdit = () => {
    setEditingId(null);
    setEditForm(emptyProviderForm);
  };
  const submitEdit = (e) => {
    e.preventDefault();
    if (!editForm.name || !editingId) return;
    onUpdate(editingId, buildProviderPayload(editForm));
    closeEdit();
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

      <Card className="p-4 mb-5 max-w-[620px]">
        <form onSubmit={submitAdd} className="flex gap-2.5 flex-wrap items-end">
          <ProviderFormFields form={form} setFn={setForm} providers={providers} />
          <Button type="submit"><Plus size={14} /> Agregar</Button>
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
          const isEditing = editingId === pr.id;
          return (
            <Card key={pr.id} className={`p-3.5 flex-1 min-w-[220px] flex flex-col ${isEditing ? 'border-primary ring-2 ring-[rgba(37,99,235,0.15)]' : ''}`}>
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

      <Sheet
        open={!!editingId}
        onClose={closeEdit}
        title={editForm.name ? `Editando: ${editForm.name}` : 'Editar proveedor'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeEdit}><X size={14} /> Cancelar</Button>
            <Button type="submit" form="edit-provider-form"><Pencil size={14} /> Guardar cambios</Button>
          </>
        }
      >
        <form id="edit-provider-form" onSubmit={submitEdit} className="flex gap-2.5 flex-wrap items-end">
          <ProviderFormFields form={editForm} setFn={setEditForm} providers={providers} />
        </form>
      </Sheet>
    </div>
  );
}

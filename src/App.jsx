import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Package, TrendingUp, AlertTriangle, Store, LayoutGrid, ListPlus, Tags, X, Loader2, ChevronDown, User, Users } from 'lucide-react';

const STORAGE_KEY = 'merch-tracker-v1';

const seedData = {
  products: [
    { id: 'p1', name: 'Planchas', category: 'Merch', price: 2.75, invested: 1000, initialStock: 2000, lowStockThreshold: 50 },
    { id: 'p2', name: 'Disfraces', category: 'Merch', price: 14.3, invested: 1008.45, initialStock: 160, lowStockThreshold: 15 },
    { id: 'p3', name: 'Pines', category: 'Merch', price: 0, invested: 848.41, initialStock: 500, lowStockThreshold: 30 },
    { id: 'p4', name: 'Vasos', category: 'Merch', price: 0, invested: 5299.8, initialStock: 1500, lowStockThreshold: 50 },
  ],
  locations: [
    { id: 'l1', name: 'Secretos', type: 'restaurante' },
    { id: 'l2', name: 'Storyland', type: 'restaurante' },
    { id: 'l3', name: 'Palacio', type: 'restaurante' },
    { id: 'l4', name: 'Oficina', type: 'oficina' },
  ],
  people: [
    { id: 'u1', name: 'Facu' },
    { id: 'u2', name: 'Marina' },
    { id: 'u3', name: 'Tomás' },
    { id: 'u4', name: 'Vale' },
  ],
  movements: [
    { id: 'm1', productId: 'p1', locationId: 'l1', personId: 'u1', type: 'venta', quantity: 88, amount: 239.9, date: '2026-06-15', note: '' },
    { id: 'm2', productId: 'p1', locationId: 'l2', personId: 'u2', type: 'venta', quantity: 53, amount: 141.8, date: '2026-06-20', note: '' },
    { id: 'm3', productId: 'p1', locationId: 'l3', personId: 'u1', type: 'venta', quantity: 40, amount: 102.4, date: '2026-06-25', note: '' },
    { id: 'm4', productId: 'p1', locationId: 'l2', personId: 'u2', type: 'fallada', quantity: 7, amount: 0, date: '2026-06-20', note: '' },
    { id: 'm5', productId: 'p1', locationId: 'l2', personId: 'u2', type: 'regalada', quantity: 6, amount: 0, date: '2026-06-20', note: '6 pack' },
    { id: 'm6', productId: 'p2', locationId: 'l1', personId: 'u3', type: 'venta', quantity: 5, amount: 71.5, date: '2026-06-19', note: '' },
  ],
};

const TYPE_META = {
  entrega: { label: 'Entrega a restaurante', color: '#3E6B8A' },
  venta: { label: 'Venta', color: '#4F7A5B' },
  fallada: { label: 'Fallada', color: '#C1442E' },
  regalada: { label: 'Regalada', color: '#C98A2C' },
  ingreso: { label: 'Ingreso / restock (compra nueva)', color: '#6B4F8A' },
};

const euro = (n) => `€${(Number(n) || 0).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);

function computeStats(products, movements) {
  return products.map((p) => {
    const pm = movements.filter((m) => m.productId === p.id);
    const vendido = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
    const recaudado = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
    const fallada = pm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
    const regalada = pm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
    const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
    const stockActual = Number(p.initialStock) + ingreso - vendido - fallada - regalada;
    return { ...p, vendido, recaudado, fallada, regalada, stockActual };
  });
}

function Card({ children, style, className = '', onClick }) {
  return (
    <div className={`tag-card ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export default function MerchTracker() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setData(raw ? JSON.parse(raw) : seedData);
    } catch {
      setData(seedData);
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setToast('No se pudo guardar en este navegador.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setTimeout(() => setSaving(false), 150);
    }
  }, []);

  if (loading || !data) {
    return (
      <div className="mt-root" style={{ padding: 40, textAlign: 'center' }}>
        <style>{baseStyles}</style>
        <Loader2 className="animate-spin" style={{ margin: '0 auto', color: '#4F7A5B' }} />
        <p className="mt-mono" style={{ marginTop: 10, fontSize: 13, color: '#6b6455' }}>Cargando stock…</p>
      </div>
    );
  }

  const stats = computeStats(data.products, data.movements);
  const totalRecaudado = stats.reduce((s, p) => s + p.recaudado, 0);
  const totalVendido = stats.reduce((s, p) => s + p.vendido, 0);
  const totalInvertido = data.products.reduce((s, p) => s + Number(p.invested), 0);
  const totalStock = stats.reduce((s, p) => s + p.stockActual, 0);
  const lowStock = stats.filter((p) => p.stockActual > 0 && p.stockActual < (Number(p.lowStockThreshold) || 20));

  const addProduct = (product) => persist({ ...data, products: [...data.products, { ...product, id: uid() }] });
  const removeProduct = (id) =>
    persist({ ...data, products: data.products.filter((p) => p.id !== id), movements: data.movements.filter((m) => m.productId !== id) });
  const addLocation = (loc) => persist({ ...data, locations: [...data.locations, { ...loc, id: uid() }] });
  const removeLocation = (id) => persist({ ...data, locations: data.locations.filter((l) => l.id !== id) });
  const addPerson = (person) => persist({ ...data, people: [...(data.people || []), { ...person, id: uid() }] });
  const removePerson = (id) => persist({ ...data, people: (data.people || []).filter((u) => u.id !== id) });
  const addMovement = (mv) => persist({ ...data, movements: [{ ...mv, id: uid() }, ...data.movements] });
  const removeMovement = (id) => persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });

  return (
    <div className="mt-root" style={{ minHeight: '100%' }}>
      <style>{baseStyles}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 200, borderRight: '1.5px solid #CFC6AC', background: '#EFEAD9', padding: '24px 14px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        <div style={{ marginBottom: 10 }}>
          <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: '#8a8367', textTransform: 'uppercase' }}>Control de stock · v1</span>
          <h1 className="mt-display" style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0', color: '#20291F', lineHeight: 1.15 }}>Merch Tracker</h1>
          <span className="mt-mono" style={{ fontSize: 10.5, color: saving ? '#C98A2C' : '#8a8367', display: 'block', marginTop: 6 }}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        </div>
        <div className="perforation" style={{ marginBottom: 8 }} />
        <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: '#8a8367', textTransform: 'uppercase', marginBottom: 4 }}>Menú</span>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, badge: lowStock.length },
          { id: 'movimientos', label: 'Movimientos', icon: ListPlus },
          { id: 'productos', label: 'Productos', icon: Package },
          { id: 'ubicaciones', label: 'Restaurantes', icon: Store },
          { id: 'personas', label: 'Personas', icon: Users },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="mt-mono tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 12.5,
              border: '1.5px solid #CFC6AC',
              background: tab === id ? '#FBF8EE' : 'transparent', color: tab === id ? '#20291F' : '#8a8367',
              borderRadius: 6, cursor: 'pointer', fontWeight: 600, width: '100%', textAlign: 'left',
              borderLeft: tab === id ? '3px solid #4F7A5B' : '1.5px solid #CFC6AC',
            }}
          >
            <Icon size={14} /> {label}
            {!!badge && (
              <span className="mt-mono" style={{ marginLeft: 'auto', background: '#C1442E', color: '#fff', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div style={{ paddingLeft: 200 }}>
        <main style={{ padding: 24, paddingBottom: 40 }}>
          {toast && (
            <div className="mt-mono" style={{ background: '#FBEAE6', border: '1.5px solid #C1442E', color: '#8a2b1a', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 16 }}>
              {toast}
            </div>
          )}

          {tab === 'dashboard' && (
            <Dashboard stats={stats} totalRecaudado={totalRecaudado} totalVendido={totalVendido} totalInvertido={totalInvertido} totalStock={totalStock} lowStock={lowStock} locations={data.locations} movements={data.movements} />
          )}
          {tab === 'movimientos' && (
            <Movimientos data={data} onAdd={addMovement} onRemove={removeMovement} />
          )}
          {tab === 'productos' && (
            <Productos products={data.products} stats={stats} onAdd={addProduct} onRemove={removeProduct} />
          )}
          {tab === 'ubicaciones' && (
            <Ubicaciones locations={data.locations} products={data.products} movements={data.movements} people={data.people || []} onAdd={addLocation} onRemove={removeLocation} onAddMovement={addMovement} />
          )}
          {tab === 'personas' && (
            <Personas people={data.people || []} movements={data.movements} onAdd={addPerson} onRemove={removePerson} />
          )}
        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <Card style={{ padding: '14px 16px', minWidth: 140, flex: '1 1 140px' }}>
      <div className="mt-mono" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: '#8a8367' }}>{label}</div>
      <div className="mt-display" style={{ fontSize: 22, fontWeight: 700, color: accent || '#20291F', marginTop: 4 }}>{value}</div>
    </Card>
  );
}

function Dashboard({ stats, totalRecaudado, totalVendido, totalInvertido, totalStock, lowStock, locations, movements }) {
  const restaurantes = locations.filter((l) => l.type === 'restaurante');
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Recaudado" value={euro(totalRecaudado)} accent="#4F7A5B" />
        <KpiCard label="Vendido (uds)" value={totalVendido} />
        <KpiCard label="Invertido" value={euro(totalInvertido)} accent="#C98A2C" />
        <KpiCard label="Stock restante" value={totalStock} />
      </div>

      {lowStock.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FBEAE6', border: '1.5px solid #C1442E', borderRadius: 6, padding: '8px 12px', marginBottom: 20 }}>
          <AlertTriangle size={15} color="#C1442E" />
          <span className="mt-mono" style={{ fontSize: 12, color: '#8a2b1a' }}>
            Stock bajo: {lowStock.map((p) => `${p.name} (${p.stockActual})`).join(', ')}
          </span>
        </div>
      )}

      <SectionTitle>Por producto</SectionTitle>
      <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
        <table className="mt-table">
          <thead>
            <tr>
              <th>Producto</th><th>Categoría</th><th>Stock</th><th>Vendido</th><th>Recaudado</th><th>Falladas</th><th>Regaladas</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="mt-mono muted">{p.category}</td>
                <td className="mt-mono" style={{ color: p.stockActual < 20 ? '#C1442E' : 'inherit' }}>{p.stockActual}</td>
                <td className="mt-mono">{p.vendido}</td>
                <td className="mt-mono">{euro(p.recaudado)}</td>
                <td className="mt-mono muted">{p.fallada}</td>
                <td className="mt-mono muted">{p.regalada}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Por restaurante</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {restaurantes.map((loc) => {
          const ventas = movements.filter((m) => m.locationId === loc.id && m.type === 'venta');
          const uds = ventas.reduce((s, m) => s + Number(m.quantity), 0);
          const monto = ventas.reduce((s, m) => s + Number(m.amount), 0);
          return (
            <Card key={loc.id} style={{ padding: '14px 16px', flex: '1 1 160px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{loc.name}</div>
              <div className="mt-mono muted" style={{ fontSize: 12 }}>{uds} unidades</div>
              <div className="mt-mono" style={{ fontSize: 15, color: '#4F7A5B', fontWeight: 600 }}>{euro(monto)}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="mt-display" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3, margin: '4px 0 10px', color: '#20291F' }}>{children}</div>;
}

function Movimientos({ data, onAdd, onRemove }) {
  const people = data.people || [];
  const [form, setForm] = useState({ productId: data.products[0]?.id || '', locationId: data.locations[0]?.id || '', personId: people[0]?.id || '', type: 'venta', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!form.productId || !form.quantity) return;
    onAdd({ ...form, quantity: Number(form.quantity), amount: Number(form.amount) || 0 });
    setForm((f) => ({ ...f, quantity: '', amount: '', note: '' }));
  };

  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Producto">
            <select className="mt-input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Ubicación">
            <select className="mt-input" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Quién">
            <select className="mt-input" value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })}>
              <option value="">—</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="mt-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Cantidad">
            <input className="mt-input" type="number" min="1" style={{ width: 90 }} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
          <Field label="Monto (€)">
            <input className="mt-input" type="number" min="0" step="0.01" style={{ width: 100 }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Fecha">
            <input className="mt-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Nota">
            <input className="mt-input" type="text" placeholder="opcional" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Registrar</button>
        </form>
      </Card>

      <SectionTitle>Historial</SectionTitle>
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table className="mt-table">
          <thead><tr><th>Fecha</th><th>Producto</th><th>Ubicación</th><th>Quién</th><th>Tipo</th><th>Cant.</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {data.movements.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>Todavía no hay movimientos cargados.</td></tr>}
            {data.movements.map((m) => {
              const prod = data.products.find((p) => p.id === m.productId);
              const loc = data.locations.find((l) => l.id === m.locationId);
              const person = people.find((u) => u.id === m.personId);
              return (
                <tr key={m.id}>
                  <td className="mt-mono muted">{m.date}</td>
                  <td style={{ fontWeight: 600 }}>{prod?.name || '—'}</td>
                  <td className="mt-mono">{loc?.name || '—'}</td>
                  <td className="mt-mono">{person?.name || '—'}</td>
                  <td><span className="mt-mono" style={{ color: TYPE_META[m.type]?.color }}>{TYPE_META[m.type]?.label}</span></td>
                  <td className="mt-mono">{m.quantity}</td>
                  <td className="mt-mono">{m.amount ? euro(m.amount) : '—'}</td>
                  <td className="muted">{m.note || '—'}</td>
                  <td><button onClick={() => onRemove(m.id)} className="icon-btn"><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8a8367' }}>{label}</span>
      {children}
    </label>
  );
}

function Productos({ products, stats, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd({ name: form.name, category: form.category || 'Merch', price: Number(form.price) || 0, invested: Number(form.invested) || 0, initialStock: Number(form.initialStock) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 20 });
    setForm({ name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20' });
  };
  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Categoría"><input className="mt-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <Field label="Precio unit. (€)"><input className="mt-input" type="number" step="0.01" style={{ width: 100 }} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Invertido (€)"><input className="mt-input" type="number" step="0.01" style={{ width: 100 }} value={form.invested} onChange={(e) => setForm({ ...form, invested: e.target.value })} /></Field>
          <Field label="Stock inicial"><input className="mt-input" type="number" style={{ width: 100 }} value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: e.target.value })} /></Field>
          <Field label="Alertar si baja de">
            <input className="mt-input" type="number" style={{ width: 90 }} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {stats.map((p) => {
          const threshold = Number(p.lowStockThreshold) || 20;
          const isLow = p.stockActual > 0 && p.stockActual < threshold;
          return (
            <Card key={p.id} style={{ padding: 14, flex: '1 1 220px', borderColor: isLow ? '#C1442E' : '#CFC6AC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.name}
                    {isLow && <AlertTriangle size={13} color="#C1442E" />}
                  </div>
                  <div className="mt-mono muted" style={{ fontSize: 11 }}>{p.category}</div>
                </div>
                <button onClick={() => onRemove(p.id)} className="icon-btn"><Trash2 size={13} /></button>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div className="mt-mono" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span className="muted">Precio</span><span>{euro(p.price)}</span>
                <span className="muted">Invertido</span><span>{euro(p.invested)}</span>
                <span className="muted">Stock inicial</span><span>{p.initialStock}</span>
                <span className="muted">Stock actual</span><span style={{ color: isLow ? '#C1442E' : 'inherit', fontWeight: isLow ? 700 : 400 }}>{p.stockActual}</span>
                <span className="muted">Umbral alerta</span><span>{threshold}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Ubicaciones({ locations, products, movements, people, onAdd, onRemove, onAddMovement }) {
  const [form, setForm] = useState({ name: '', type: 'restaurante' });
  const [selectedId, setSelectedId] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd(form);
    setForm({ name: '', type: 'restaurante' });
  };

  const selected = locations.find((l) => l.id === selectedId) || null;

  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 420 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Tipo">
            <select className="mt-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="restaurante">Restaurante</option>
              <option value="oficina">Oficina</option>
            </select>
          </Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar</button>
        </form>
      </Card>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: selected ? 20 : 0 }}>
        {locations.map((l) => (
          <Card
            key={l.id}
            onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderColor: selectedId === l.id ? '#4F7A5B' : '#CFC6AC' }}
          >
            <Store size={15} color="#6B8F71" />
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span className="mt-mono muted" style={{ fontSize: 11 }}>{l.type}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(l.id); }} className="icon-btn" style={{ marginLeft: 4 }}><X size={13} /></button>
          </Card>
        ))}
      </div>

      {selected && <LocationDetail location={selected} products={products} movements={movements} people={people} onClose={() => setSelectedId(null)} onAddMovement={onAddMovement} />}
    </div>
  );
}

function LocationDetail({ location, products, movements, people, onClose, onAddMovement }) {
  const lm = movements.filter((m) => m.locationId === location.id);
  const [quick, setQuick] = useState({ productId: products[0]?.id || '', personId: people[0]?.id || '', type: 'entrega', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const [historyOpen, setHistoryOpen] = useState(false);

  const submitQuick = (e) => {
    e.preventDefault();
    if (!quick.productId || !quick.quantity) return;
    onAddMovement({ productId: quick.productId, locationId: location.id, personId: quick.personId, type: quick.type, quantity: Number(quick.quantity), amount: Number(quick.amount) || 0, date: quick.date, note: '' });
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
    <Card style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div className="mt-mono muted" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' }}>Detalle</div>
          <div className="mt-display" style={{ fontSize: 20, fontWeight: 700 }}>{location.name}</div>
        </div>
        <button onClick={onClose} className="icon-btn"><X size={16} /></button>
      </div>
      <div className="perforation" style={{ margin: '10px 0' }} />

      <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
        <div>
          <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase' }}>Vendido</div>
          <div className="mt-mono" style={{ fontSize: 16, fontWeight: 600 }}>{totalVendido} uds</div>
        </div>
        <div>
          <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase' }}>Recaudado</div>
          <div className="mt-mono" style={{ fontSize: 16, fontWeight: 600, color: '#4F7A5B' }}>{euro(totalRecaudado)}</div>
        </div>
      </div>

      <div className="mt-mono" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: '#8a8367', marginBottom: 8 }}>Agregar producto a {location.name}</div>
      <form onSubmit={submitQuick} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18, padding: 12, background: '#F1ECDD', borderRadius: 6, border: '1.5px dashed #CFC6AC' }}>
        <Field label="Producto">
          <select className="mt-input" value={quick.productId} onChange={(e) => setQuick({ ...quick, productId: e.target.value })}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Quién">
          <select className="mt-input" value={quick.personId} onChange={(e) => setQuick({ ...quick, personId: e.target.value })}>
            <option value="">—</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="mt-input" value={quick.type} onChange={(e) => setQuick({ ...quick, type: e.target.value })}>
            {Object.entries(TYPE_META).filter(([k]) => k !== 'ingreso').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Cantidad">
          <input className="mt-input" type="number" min="1" style={{ width: 90 }} value={quick.quantity} onChange={(e) => setQuick({ ...quick, quantity: e.target.value })} required />
        </Field>
        <Field label="Monto (€)">
          <input className="mt-input" type="number" min="0" step="0.01" style={{ width: 100 }} value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value })} />
        </Field>
        <Field label="Fecha">
          <input className="mt-input" type="date" value={quick.date} onChange={(e) => setQuick({ ...quick, date: e.target.value })} />
        </Field>
        <button type="submit" className="mt-btn"><Plus size={14} /> Registrar</button>
      </form>

      {porProducto.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>Todavía no hay movimientos registrados para este local.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table className="mt-table">
            <thead>
              <tr><th>Producto</th><th>Recibido</th><th>Vendido</th><th>Recaudado</th><th>Falladas</th><th>Regaladas</th></tr>
            </thead>
            <tbody>
              {porProducto.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="mt-mono muted">{p.recibido || '—'}</td>
                  <td className="mt-mono">{p.vendido}</td>
                  <td className="mt-mono">{euro(p.recaudado)}</td>
                  <td className="mt-mono muted">{p.fallada}</td>
                  <td className="mt-mono muted">{p.regalada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => setHistoryOpen((v) => !v)}
        className="mt-mono"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0',
          fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: '#8a8367',
        }}
      >
        <ChevronDown size={14} style={{ transform: historyOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        Historial en este local ({lm.length})
      </button>
      {historyOpen && (
        <div style={{ overflowX: 'auto' }}>
          <table className="mt-table">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Quién</th><th>Tipo</th><th>Cant.</th><th>Monto</th><th>Nota</th></tr></thead>
            <tbody>
              {lm.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 12 }}>Sin movimientos.</td></tr>}
              {lm.map((m) => {
                const prod = products.find((p) => p.id === m.productId);
                const person = people.find((u) => u.id === m.personId);
                return (
                  <tr key={m.id}>
                    <td className="mt-mono muted">{m.date}</td>
                    <td style={{ fontWeight: 600 }}>{prod?.name || '—'}</td>
                    <td className="mt-mono">{person?.name || '—'}</td>
                    <td><span className="mt-mono" style={{ color: TYPE_META[m.type]?.color }}>{TYPE_META[m.type]?.label}</span></td>
                    <td className="mt-mono">{m.quantity}</td>
                    <td className="mt-mono">{m.amount ? euro(m.amount) : '—'}</td>
                    <td className="muted">{m.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Personas({ people, movements, onAdd, onRemove }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim() });
    setName('');
  };
  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 380 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Rocío" required /></Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar persona</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {people.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay personas cargadas.</p>}
        {people.map((u) => {
          const count = movements.filter((m) => m.personId === u.id).length;
          return (
            <Card key={u.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <User size={15} color="#6B8F71" />
              <span style={{ fontWeight: 600 }}>{u.name}</span>
              <span className="mt-mono muted" style={{ fontSize: 11 }}>{count} movimiento{count === 1 ? '' : 's'}</span>
              <button onClick={() => onRemove(u.id)} className="icon-btn" style={{ marginLeft: 4 }}><X size={13} /></button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
  .mt-root { font-family: 'Inter', sans-serif; background: #EFEAD9; color: #20291F; }
  .mt-display { font-family: 'Space Grotesk', sans-serif; }
  .mt-mono { font-family: 'IBM Plex Mono', monospace; }
  .muted { color: #8a8367; }
  .perforation { background-image: radial-gradient(circle, #CFC6AC 1.4px, transparent 1.4px); background-size: 12px 2px; height: 2px; }
  .tag-card { position: relative; border: 1.4px solid #CFC6AC; background: #FBF8EE; border-radius: 8px; }
  .mt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .mt-table th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.5px; text-transform: uppercase; color: #8a8367; padding: 10px 14px; border-bottom: 1.4px solid #CFC6AC; }
  .mt-table td { padding: 9px 14px; border-bottom: 1px solid #E4DFCC; }
  .mt-table tr:last-child td { border-bottom: none; }
  .mt-input { border: 1.4px solid #CFC6AC; background: #FBF8EE; border-radius: 5px; padding: 6px 9px; font-size: 13px; font-family: 'Inter', sans-serif; color: #20291F; }
  .mt-input:focus { outline: 2px solid #4F7A5B; outline-offset: 1px; }
  .mt-btn { display: flex; align-items: center; gap: 6px; background: #20291F; color: #FBF8EE; border: none; border-radius: 5px; padding: 8px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
  .mt-btn:hover { background: #34412E; }
  .icon-btn { background: none; border: none; color: #8a8367; cursor: pointer; padding: 4px; display: flex; }
  .icon-btn:hover { color: #C1442E; }
  .tab-btn:hover { color: #20291F; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
`;

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Package, TrendingUp, AlertTriangle, Store, LayoutGrid, ListPlus, Tags, X, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'merch-tracker-v1';

const seedData = {
  products: [
    { id: 'p1', name: 'Planchas', category: 'Merch', price: 2.75, invested: 1000, initialStock: 2000 },
    { id: 'p2', name: 'Disfraces', category: 'Merch', price: 14.3, invested: 1008.45, initialStock: 160 },
    { id: 'p3', name: 'Pines', category: 'Merch', price: 0, invested: 848.41, initialStock: 500 },
    { id: 'p4', name: 'Vasos', category: 'Merch', price: 0, invested: 5299.8, initialStock: 1500 },
  ],
  locations: [
    { id: 'l1', name: 'Secretos', type: 'restaurante' },
    { id: 'l2', name: 'Storyland', type: 'restaurante' },
    { id: 'l3', name: 'Palacio', type: 'restaurante' },
    { id: 'l4', name: 'Oficina', type: 'oficina' },
  ],
  movements: [
    { id: 'm1', productId: 'p1', locationId: 'l1', type: 'venta', quantity: 88, amount: 239.9, date: '2026-06-15', note: '' },
    { id: 'm2', productId: 'p1', locationId: 'l2', type: 'venta', quantity: 53, amount: 141.8, date: '2026-06-20', note: '' },
    { id: 'm3', productId: 'p1', locationId: 'l3', type: 'venta', quantity: 40, amount: 102.4, date: '2026-06-25', note: '' },
    { id: 'm4', productId: 'p1', locationId: 'l2', type: 'fallada', quantity: 7, amount: 0, date: '2026-06-20', note: '' },
    { id: 'm5', productId: 'p1', locationId: 'l2', type: 'regalada', quantity: 6, amount: 0, date: '2026-06-20', note: '6 pack' },
    { id: 'm6', productId: 'p2', locationId: 'l1', type: 'venta', quantity: 5, amount: 71.5, date: '2026-06-19', note: '' },
  ],
};

const TYPE_META = {
  venta: { label: 'Venta', color: '#4F7A5B' },
  fallada: { label: 'Fallada', color: '#C1442E' },
  regalada: { label: 'Regalada', color: '#C98A2C' },
  ingreso: { label: 'Ingreso / restock', color: '#3E6B8A' },
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

function Punch() {
  return <span className="punch" />;
}

function Card({ children, style, className = '' }) {
  return (
    <div className={`tag-card ${className}`} style={style}>
      <Punch />
      <span className="punch punch-r" />
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
  const lowStock = stats.filter((p) => p.stockActual > 0 && p.stockActual < 20);

  const addProduct = (product) => persist({ ...data, products: [...data.products, { ...product, id: uid() }] });
  const removeProduct = (id) =>
    persist({ ...data, products: data.products.filter((p) => p.id !== id), movements: data.movements.filter((m) => m.productId !== id) });
  const addLocation = (loc) => persist({ ...data, locations: [...data.locations, { ...loc, id: uid() }] });
  const removeLocation = (id) => persist({ ...data, locations: data.locations.filter((l) => l.id !== id) });
  const addMovement = (mv) => persist({ ...data, movements: [{ ...mv, id: uid() }, ...data.movements] });
  const removeMovement = (id) => persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });

  return (
    <div className="mt-root" style={{ minHeight: '100%', paddingBottom: 24 }}>
      <style>{baseStyles}</style>

      <header style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span className="mt-mono" style={{ fontSize: 11, letterSpacing: 1.5, color: '#8a8367', textTransform: 'uppercase' }}>Control de stock · v1</span>
            <h1 className="mt-display" style={{ fontSize: 28, fontWeight: 700, margin: '2px 0 0', color: '#20291F' }}>Merch Tracker</h1>
          </div>
          <span className="mt-mono" style={{ fontSize: 11, color: saving ? '#C98A2C' : '#8a8367' }}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        </div>
        <div className="perforation" style={{ marginTop: 16 }} />
      </header>

      <nav style={{ display: 'flex', gap: 4, padding: '14px 20px 0', flexWrap: 'wrap' }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
          { id: 'movimientos', label: 'Movimientos', icon: ListPlus },
          { id: 'productos', label: 'Productos', icon: Package },
          { id: 'ubicaciones', label: 'Restaurantes', icon: Store },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="mt-mono tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12.5,
              border: '1.5px solid #CFC6AC', borderBottom: tab === id ? '1.5px solid #FBF8EE' : '1.5px solid #CFC6AC',
              background: tab === id ? '#FBF8EE' : 'transparent', color: tab === id ? '#20291F' : '#8a8367',
              borderRadius: '6px 6px 0 0', cursor: 'pointer', marginBottom: -1.5, fontWeight: 600,
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </nav>
      <div style={{ borderBottom: '1.5px solid #CFC6AC', margin: '0 20px' }} />

      <main style={{ padding: 20 }}>
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
          <Ubicaciones locations={data.locations} onAdd={addLocation} onRemove={removeLocation} />
        )}
      </main>
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
  const [form, setForm] = useState({ productId: data.products[0]?.id || '', locationId: data.locations[0]?.id || '', type: 'venta', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });

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
          <thead><tr><th>Fecha</th><th>Producto</th><th>Ubicación</th><th>Tipo</th><th>Cant.</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {data.movements.length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>Todavía no hay movimientos cargados.</td></tr>}
            {data.movements.map((m) => {
              const prod = data.products.find((p) => p.id === m.productId);
              const loc = data.locations.find((l) => l.id === m.locationId);
              return (
                <tr key={m.id}>
                  <td className="mt-mono muted">{m.date}</td>
                  <td style={{ fontWeight: 600 }}>{prod?.name || '—'}</td>
                  <td className="mt-mono">{loc?.name || '—'}</td>
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
  const [form, setForm] = useState({ name: '', category: 'Merch', price: '', invested: '', initialStock: '' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd({ name: form.name, category: form.category || 'Merch', price: Number(form.price) || 0, invested: Number(form.invested) || 0, initialStock: Number(form.initialStock) || 0 });
    setForm({ name: '', category: 'Merch', price: '', invested: '', initialStock: '' });
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
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {stats.map((p) => (
          <Card key={p.id} style={{ padding: 14, flex: '1 1 220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="mt-mono muted" style={{ fontSize: 11 }}>{p.category}</div>
              </div>
              <button onClick={() => onRemove(p.id)} className="icon-btn"><Trash2 size={13} /></button>
            </div>
            <div className="perforation" style={{ margin: '10px 0' }} />
            <div className="mt-mono" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <span className="muted">Precio</span><span>{euro(p.price)}</span>
              <span className="muted">Invertido</span><span>{euro(p.invested)}</span>
              <span className="muted">Stock inicial</span><span>{p.initialStock}</span>
              <span className="muted">Stock actual</span><span style={{ color: p.stockActual < 20 ? '#C1442E' : 'inherit' }}>{p.stockActual}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Ubicaciones({ locations, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', type: 'restaurante' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd(form);
    setForm({ name: '', type: 'restaurante' });
  };
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {locations.map((l) => (
          <Card key={l.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Store size={15} color="#6B8F71" />
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span className="mt-mono muted" style={{ fontSize: 11 }}>{l.type}</span>
            <button onClick={() => onRemove(l.id)} className="icon-btn" style={{ marginLeft: 4 }}><X size={13} /></button>
          </Card>
        ))}
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
  .punch { position: absolute; top: 8px; left: 8px; width: 8px; height: 8px; border-radius: 50%; background: #EFEAD9; border: 1.4px solid #CFC6AC; }
  .punch-r { left: auto; right: 8px; }
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

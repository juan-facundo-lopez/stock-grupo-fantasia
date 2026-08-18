import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Package, TrendingUp, AlertTriangle, Store, LayoutGrid, ListPlus, Tags, X, Loader2, ChevronDown, User, Users, Wifi, WifiOff, Truck, Mail, Upload, ImageOff, Pencil, Download, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'merch-tracker-v1';

// Únicos mails autorizados a entrar. La restricción real (a prueba de manipulación)
// vive en las políticas RLS de Supabase; esto es solo para dar un mensaje claro en pantalla.
const ALLOWED_EMAILS = ['jflopezsigon@gmail.com', 'gaston@grupofantasia.es'];

const seedData = {
  products: [],
  providers: [],
  locations: [],
  people: [],
  movements: [],
};

const TYPE_META = {
  entrega: { label: 'Entrega a restaurante', color: '#3E6B8A' },
  venta: { label: 'Venta', color: '#3D7A5C' },
  fallada: { label: 'Fallada', color: '#D8493F' },
  regalada: { label: 'Regalada', color: '#B8791A' },
  ingreso: { label: 'Ingreso / restock (compra nueva)', color: '#6B4F8A' },
};

const euro = (n) => `€${(Number(n) || 0).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);
const confirmDelete = (msg) => window.confirm(msg || '¿Seguro que querés eliminar esto? No se puede deshacer.');

function buildOrderMailto(product, provider, qty) {
  const subject = `Pedido de reposición: ${product.name}`;
  const lines = [
    `Hola${provider?.name ? ' ' + provider.name : ''},`,
    '',
    `Necesitamos reponer stock de "${product.name}".`,
    `Cantidad solicitada: ${qty} unidades`,
  ];
  if (product.unitsPerPackage) lines.push(`Unidades por paquete: ${product.unitsPerPackage}`);
  if (product.weight) lines.push(`Peso / medida: ${product.weight}`);
  if (product.mockupUrl) lines.push('', `Mockup / referencia: ${product.mockupUrl}`);
  lines.push('', 'Gracias!');
  const body = lines.join('\n');
  return `mailto:${provider?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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
  const [session, setSession] = useState(undefined); // undefined = verificando, null = sin sesión
  const [authError, setAuthError] = useState('');
  const skipNextRealtime = useRef(false);

  const cloudOn = !!supabase;
  const userEmail = session?.user?.email || '';
  const isAllowed = !cloudOn || ALLOWED_EMAILS.includes(userEmail);
  const readyForData = !cloudOn || (session && isAllowed);

  // Sesión de Google (solo aplica cuando hay Supabase conectado)
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError('No se pudo iniciar sesión: ' + error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    if (!readyForData) return;
    (async () => {
      if (supabase) {
        try {
          const { data: row, error } = await supabase.from('app_state').select('data').eq('id', 'main').maybeSingle();
          if (error) throw error;
          if (row && row.data && Object.keys(row.data).length > 0) {
            setData(row.data);
          } else {
            await supabase.from('app_state').upsert({ id: 'main', data: seedData });
            setData(seedData);
          }
        } catch {
          setToast('No se pudo conectar con la base compartida. Usando datos locales.');
          setTimeout(() => setToast(''), 5000);
          setData(seedData);
        } finally {
          setLoading(false);
        }
        return;
      }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setData(raw ? JSON.parse(raw) : seedData);
      } catch {
        setData(seedData);
      } finally {
        setLoading(false);
      }
    })();
  }, [readyForData]);

  // Escucha cambios que haga la otra persona en tiempo real
  useEffect(() => {
    if (!supabase || !readyForData) return;
    const channel = supabase
      .channel('app_state_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'id=eq.main' }, (payload) => {
        if (skipNextRealtime.current) {
          skipNextRealtime.current = false;
          return;
        }
        if (payload.new?.data) setData(payload.new.data);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    setSaving(true);
    if (supabase) {
      skipNextRealtime.current = true;
      try {
        const { error } = await supabase.from('app_state').upsert({ id: 'main', data: next, updated_at: new Date().toISOString() });
        if (error) throw error;
      } catch {
        setToast('No se pudo guardar en la base compartida.');
        setTimeout(() => setToast(''), 4000);
      } finally {
        setTimeout(() => setSaving(false), 150);
      }
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setToast('No se pudo guardar en este navegador.');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setTimeout(() => setSaving(false), 150);
    }
  }, []);

  if (cloudOn && session === undefined) {
    return (
      <div className="mt-root" style={{ padding: 40, textAlign: 'center' }}>
        <style>{baseStyles}</style>
        <Loader2 className="animate-spin" style={{ margin: '0 auto', color: '#3D7A5C' }} />
        <p className="mt-mono" style={{ marginTop: 10, fontSize: 13, color: '#6B7280' }}>Verificando sesión…</p>
      </div>
    );
  }

  if (cloudOn && !session) {
    return <LoginScreen onSignIn={signInWithGoogle} error={authError} />;
  }

  if (cloudOn && !isAllowed) {
    return <NotAuthorizedScreen email={userEmail} onSignOut={signOut} />;
  }

  if (loading || !data) {
    return (
      <div className="mt-root" style={{ padding: 40, textAlign: 'center' }}>
        <style>{baseStyles}</style>
        <Loader2 className="animate-spin" style={{ margin: '0 auto', color: '#3D7A5C' }} />
        <p className="mt-mono" style={{ marginTop: 10, fontSize: 13, color: '#6B7280' }}>Cargando stock…</p>
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
  const updateProduct = (id, updates) => persist({ ...data, products: data.products.map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  const removeProduct = (id) => {
    if (!confirmDelete('¿Eliminar este producto? También se van a borrar todos sus movimientos registrados.')) return;
    persist({ ...data, products: data.products.filter((p) => p.id !== id), movements: data.movements.filter((m) => m.productId !== id) });
  };
  const addLocation = (loc) => persist({ ...data, locations: [...data.locations, { ...loc, id: uid() }] });
  const removeLocation = (id) => {
    if (!confirmDelete('¿Eliminar este restaurante/ubicación?')) return;
    persist({ ...data, locations: data.locations.filter((l) => l.id !== id) });
  };
  const addPerson = (person) => persist({ ...data, people: [...(data.people || []), { ...person, id: uid() }] });
  const removePerson = (id) => {
    if (!confirmDelete('¿Eliminar esta persona del equipo?')) return;
    persist({ ...data, people: (data.people || []).filter((u) => u.id !== id) });
  };
  const addProvider = (provider) => persist({ ...data, providers: [...(data.providers || []), { ...provider, id: uid() }] });
  const removeProvider = (id) => {
    if (!confirmDelete('¿Eliminar este proveedor?')) return;
    persist({ ...data, providers: (data.providers || []).filter((p) => p.id !== id) });
  };
  const addMovement = (mv) => persist({ ...data, movements: [{ ...mv, id: uid() }, ...data.movements] });
  const updateMovement = (id, updates) => persist({ ...data, movements: data.movements.map((m) => (m.id === id ? { ...m, ...updates } : m)) });
  const removeMovement = (id) => {
    if (!confirmDelete('¿Eliminar este movimiento? No se puede deshacer.')) return;
    persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });
  };

  return (
    <div className="mt-root" style={{ minHeight: '100%' }}>
      <style>{baseStyles}</style>

      <nav style={{ position: 'fixed', top: 16, left: 16, bottom: 16, width: 208, background: '#FFFFFF', border: '1px solid #EDEEF1', borderRadius: 16, boxShadow: '0 1px 2px rgba(16,20,24,0.04), 0 1px 1px rgba(16,20,24,0.03)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 16px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#16181D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>M</div>
          <h1 className="mt-display" style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: '#16181D', letterSpacing: '-0.2px', lineHeight: 1.15 }}>Merch Tracker</h1>
        </div>
        <span className="mt-mono" style={{ fontSize: 10.5, color: saving ? '#B8791A' : '#9CA3AF', padding: '0 8px 4px' }}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        <span className="mt-mono" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 14px', color: cloudOn ? '#3D7A5C' : '#9CA3AF' }}>
          {cloudOn ? <Wifi size={11} /> : <WifiOff size={11} />} {cloudOn ? 'compartido (Supabase)' : 'solo local'}
        </span>
        <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600, padding: '0 10px 6px' }}>Menú</span>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, badge: lowStock.length },
          { id: 'movimientos', label: 'Movimientos', icon: ListPlus },
          { id: 'productos', label: 'Productos', icon: Package },
          { id: 'ubicaciones', label: 'Restaurantes', icon: Store },
          { id: 'personas', label: 'Personas', icon: Users },
          { id: 'proveedores', label: 'Proveedores', icon: Truck },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="mt-mono tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', fontSize: 13,
              border: 'none',
              background: tab === id ? '#E8F2EC' : 'transparent', color: tab === id ? '#3D7A5C' : '#6B7280',
              borderRadius: 8, cursor: 'pointer', fontWeight: tab === id ? 600 : 500, width: '100%', textAlign: 'left',
            }}
          >
            <Icon size={15} color={tab === id ? '#3D7A5C' : '#9CA3AF'} /> {label}
            {!!badge && (
              <span className="mt-mono" style={{ marginLeft: 'auto', background: '#FBEAE9', color: '#D8493F', borderRadius: 20, fontSize: 10.5, padding: '1px 6px', fontWeight: 700 }}>{badge}</span>
            )}
          </button>
        ))}
        {cloudOn && (
          <>
            <div className="perforation" style={{ margin: '10px 8px' }} />
            <button
              onClick={signOut}
              className="mt-mono"
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', fontSize: 12.5,
                border: 'none', background: 'transparent', color: '#9CA3AF',
                borderRadius: 8, cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left',
              }}
            >
              <LogOut size={14} /> {userEmail}
            </button>
          </>
        )}
      </nav>

      <div style={{ marginLeft: 240, paddingTop: 16 }}>
        <main style={{ padding: '0 20px 40px' }}>
          {toast && (
            <div className="mt-mono" style={{ background: '#FBEAE9', border: '1px solid #F5C6C2', color: '#B23A31', padding: '10px 14px', borderRadius: 12, fontSize: 12.5, marginBottom: 16 }}>
              {toast}
            </div>
          )}

          {tab === 'dashboard' && (
            <Dashboard stats={stats} totalRecaudado={totalRecaudado} totalVendido={totalVendido} totalInvertido={totalInvertido} totalStock={totalStock} lowStock={lowStock} locations={data.locations} movements={data.movements} />
          )}
          {tab === 'movimientos' && (
            <Movimientos data={data} onAdd={addMovement} onUpdate={updateMovement} onRemove={removeMovement} />
          )}
          {tab === 'productos' && (
            <Productos products={data.products} stats={stats} providers={data.providers || []} onAdd={addProduct} onRemove={removeProduct} />
          )}
          {tab === 'ubicaciones' && (
            <Ubicaciones locations={data.locations} products={data.products} movements={data.movements} people={data.people || []} onAdd={addLocation} onRemove={removeLocation} onAddMovement={addMovement} onUpdateMovement={updateMovement} onRemoveMovement={removeMovement} />
          )}
          {tab === 'personas' && (
            <Personas people={data.people || []} movements={data.movements} onAdd={addPerson} onRemove={removePerson} />
          )}
          {tab === 'proveedores' && (
            <Proveedores providers={data.providers || []} products={data.products} onAdd={addProvider} onRemove={removeProvider} />
          )}
        </main>
      </div>
    </div>
  );
}

function LoginScreen({ onSignIn, error }) {
  return (
    <div className="mt-root" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{baseStyles}</style>
      <Card style={{ padding: '36px 32px', maxWidth: 340, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: '#16181D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, margin: '0 auto 16px' }}>M</div>
        <h1 className="mt-display" style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px', color: '#16181D' }}>Merch Tracker</h1>
        <p className="mt-mono" style={{ fontSize: 12.5, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.5 }}>
          Iniciá sesión con tu cuenta de Google para acceder al stock de Grupo Fantasía.
        </p>
        <button onClick={onSignIn} className="mt-btn" style={{ width: '100%' }}>
          <LogIn size={15} /> Continuar con Google
        </button>
        {error && <p className="mt-mono" style={{ fontSize: 11.5, color: '#D8493F', marginTop: 14 }}>{error}</p>}
      </Card>
    </div>
  );
}

function NotAuthorizedScreen({ email, onSignOut }) {
  return (
    <div className="mt-root" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{baseStyles}</style>
      <Card style={{ padding: '36px 32px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <ShieldAlert size={30} color="#D8493F" style={{ margin: '0 auto 14px' }} />
        <h1 className="mt-display" style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#16181D' }}>Sin acceso</h1>
        <p className="mt-mono" style={{ fontSize: 12.5, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          La cuenta <strong style={{ color: '#16181D' }}>{email}</strong> no tiene permiso para entrar acá. Pedile a un administrador que te agregue.
        </p>
        <button onClick={onSignOut} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E1E3E8', boxShadow: 'none', width: '100%' }}>
          <LogOut size={15} /> Cerrar sesión
        </button>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <Card style={{ padding: '18px 18px 16px', minWidth: 160, flex: '1 1 160px' }}>
      <div className="mt-mono" style={{ fontSize: 11.5, fontWeight: 500, color: '#6B7280', marginBottom: 8 }}>{label}</div>
      <div className="mt-display" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', color: accent || '#16181D' }}>{value}</div>
    </Card>
  );
}

function Dashboard({ stats, totalRecaudado, totalVendido, totalInvertido, totalStock, lowStock, locations, movements }) {
  const restaurantes = locations.filter((l) => l.type === 'restaurante');
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Recaudado" value={euro(totalRecaudado)} accent="#3D7A5C" />
        <KpiCard label="Vendido (uds)" value={totalVendido} />
        <KpiCard label="Invertido" value={euro(totalInvertido)} accent="#B8791A" />
        <KpiCard label="Stock restante" value={totalStock} />
      </div>

      {lowStock.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FBEAE9', border: '1px solid #F5C6C2', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
          <AlertTriangle size={15} color="#D8493F" />
          <span className="mt-mono" style={{ fontSize: 12.5, color: '#B23A31' }}>
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
                <td className="mt-mono" style={{ color: p.stockActual < 20 ? '#D8493F' : 'inherit' }}>{p.stockActual}</td>
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {restaurantes.map((loc) => {
          const ventas = movements.filter((m) => m.locationId === loc.id && m.type === 'venta');
          const uds = ventas.reduce((s, m) => s + Number(m.quantity), 0);
          const monto = ventas.reduce((s, m) => s + Number(m.amount), 0);
          return (
            <Card key={loc.id} style={{ padding: '14px 16px', flex: '1 1 160px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{loc.name}</div>
              <div className="mt-mono muted" style={{ fontSize: 12 }}>{uds} unidades</div>
              <div className="mt-mono" style={{ fontSize: 15, color: '#3D7A5C', fontWeight: 600 }}>{euro(monto)}</div>
            </Card>
          );
        })}
      </div>

      <SectionTitle>Gráficos</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <Card style={{ padding: 16, flex: '1 1 320px' }}>
          <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase', marginBottom: 10 }}>Recaudado por producto</div>
          <BarChart data={stats.map((p) => ({ label: p.name, value: p.recaudado }))} color="#3D7A5C" valueFormat={euro} />
        </Card>
        <Card style={{ padding: 16, flex: '1 1 320px' }}>
          <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase', marginBottom: 10 }}>Recaudado por restaurante</div>
          <BarChart
            data={restaurantes.map((loc) => ({
              label: loc.name,
              value: movements.filter((m) => m.locationId === loc.id && m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0),
            }))}
            color="#B8791A"
            valueFormat={euro}
          />
        </Card>
      </div>

      <Card style={{ padding: 16, marginBottom: 4 }}>
        <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase', marginBottom: 10 }}>Recaudado por día (ventas)</div>
        <TrendChart movements={movements} />
      </Card>
    </div>
  );
}

function BarChart({ data, color = '#3D7A5C', valueFormat = (v) => v, height = 150 }) {
  const clean = data.filter((d) => d.value > 0);
  if (clean.length === 0) return <p className="muted" style={{ fontSize: 12 }}>Todavía no hay datos para graficar.</p>;
  const max = Math.max(1, ...clean.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height, overflowX: 'auto', padding: '4px 4px 0' }}>
      {clean.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 46, flex: '0 0 auto' }}>
          <span className="mt-mono" style={{ fontSize: 10.5, color: '#16181D', marginBottom: 4, whiteSpace: 'nowrap' }}>{valueFormat(d.value)}</span>
          <div style={{ width: 30, height: Math.max(3, (d.value / max) * (height - 46)), background: color, borderRadius: '4px 4px 0 0' }} />
          <span className="mt-mono muted" style={{ fontSize: 10, marginTop: 6, whiteSpace: 'nowrap' }}>{d.label}</span>
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

  if (data.length === 0) return <p className="muted" style={{ fontSize: 12 }}>Todavía no hay ventas registradas para graficar la tendencia.</p>;
  return <BarChart data={data} color="#3D7A5C" valueFormat={euro} height={140} />;
}

function SectionTitle({ children }) {
  return <div className="mt-display" style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.1px', margin: '4px 0 12px', color: '#16181D' }}>{children}</div>;
}

function getProductStock(product, movements) {
  const pm = movements.filter((m) => m.productId === product.id);
  const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const salida = pm.filter((m) => ['venta', 'fallada', 'regalada'].includes(m.type)).reduce((s, m) => s + Number(m.quantity), 0);
  return Number(product.initialStock) + ingreso - salida;
}

function exportMovementsCsv(movements, products, locations, people) {
  const header = ['Fecha', 'Producto', 'Ubicación', 'Quién', 'Tipo', 'Cantidad', 'Monto', 'Nota'];
  const rows = movements.map((m) => [
    m.date,
    products.find((p) => p.id === m.productId)?.name || '',
    locations.find((l) => l.id === m.locationId)?.name || '',
    people.find((u) => u.id === m.personId)?.name || '',
    TYPE_META[m.type]?.label || m.type,
    m.quantity,
    m.amount || 0,
    (m.note || '').replace(/"/g, "'"),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyMovForm = (products, locations, people) => ({
  productId: products[0]?.id || '', locationId: locations[0]?.id || '', personId: people[0]?.id || '',
  type: 'venta', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10), note: '',
});

function Movimientos({ data, onAdd, onUpdate, onRemove }) {
  const people = data.people || [];
  const [form, setForm] = useState(() => emptyMovForm(data.products, data.locations, people));
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ productId: '', locationId: '', personId: '', type: '', from: '', to: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!form.productId || !form.quantity) return;
    const qty = Number(form.quantity);
    if (['venta', 'fallada', 'regalada'].includes(form.type)) {
      const product = data.products.find((p) => p.id === form.productId);
      if (product) {
        let currentStock = getProductStock(product, data.movements);
        if (editingId) {
          const prev = data.movements.find((m) => m.id === editingId);
          if (prev && prev.productId === form.productId && ['venta', 'fallada', 'regalada'].includes(prev.type)) currentStock += Number(prev.quantity);
        }
        if (qty > currentStock) {
          const ok = window.confirm(`Ojo: esto va a dejar el stock de "${product.name}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    const payload = { ...form, quantity: qty, amount: Number(form.amount) || 0 };
    if (editingId) {
      onUpdate(editingId, payload);
      setEditingId(null);
    } else {
      onAdd(payload);
    }
    setForm((f) => ({ ...emptyMovForm(data.products, data.locations, people), productId: f.productId, locationId: f.locationId, personId: f.personId, type: f.type }));
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setForm({ productId: m.productId, locationId: m.locationId, personId: m.personId || '', type: m.type, quantity: String(m.quantity), amount: m.amount ? String(m.amount) : '', date: m.date, note: m.note || '' });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyMovForm(data.products, data.locations, people));
  };

  const categories = [...new Set(data.products.map((p) => p.category).filter(Boolean))];

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

  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20, borderColor: editingId ? '#B8791A' : '#E1E3E8' }}>
        {editingId && (
          <div className="mt-mono" style={{ fontSize: 11, color: '#B8791A', marginBottom: 10 }}>
            Editando movimiento existente
          </div>
        )}
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
          <button type="submit" className="mt-btn">
            {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Registrar</>}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1.4px solid #E1E3E8' }}>
              <X size={14} /> Cancelar
            </button>
          )}
        </form>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <SectionTitle>Historial</SectionTitle>
        <button onClick={() => exportMovementsCsv(filtered, data.products, data.locations, people)} className="mt-btn">
          <Download size={13} /> Exportar CSV ({filtered.length})
        </button>
      </div>

      <Card style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Producto">
            <select className="mt-input" value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}>
              <option value="">Todos</option>
              {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Ubicación">
            <select className="mt-input" value={filters.locationId} onChange={(e) => setFilters({ ...filters, locationId: e.target.value })}>
              <option value="">Todas</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Quién">
            <select className="mt-input" value={filters.personId} onChange={(e) => setFilters({ ...filters, personId: e.target.value })}>
              <option value="">Todos</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select className="mt-input" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Desde"><input className="mt-input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="Hasta"><input className="mt-input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          {filtersActive && (
            <button
              onClick={() => setFilters({ productId: '', locationId: '', personId: '', type: '', from: '', to: '' })}
              className="mt-mono"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FBEAE9', border: '1.4px solid #D8493F', color: '#B23A31', borderRadius: 5, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <X size={13} /> Limpiar filtros
            </button>
          )}
        </div>
      </Card>

      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table className="mt-table">
          <thead><tr><th>Fecha</th><th>Producto</th><th>Ubicación</th><th>Quién</th><th>Tipo</th><th>Cant.</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="muted" style={{ padding: 16 }}>{filtersActive ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos cargados.'}</td></tr>}
            {filtered.map((m) => {
              const prod = data.products.find((p) => p.id === m.productId);
              const loc = data.locations.find((l) => l.id === m.locationId);
              const person = people.find((u) => u.id === m.personId);
              return (
                <tr key={m.id} style={{ background: editingId === m.id ? '#F7F7F8' : 'transparent' }}>
                  <td className="mt-mono muted">{m.date}</td>
                  <td style={{ fontWeight: 600 }}>{prod?.name || '—'}</td>
                  <td className="mt-mono">{loc?.name || '—'}</td>
                  <td className="mt-mono">{person?.name || '—'}</td>
                  <td><span className="mt-mono" style={{ color: TYPE_META[m.type]?.color }}>{TYPE_META[m.type]?.label}</span></td>
                  <td className="mt-mono">{m.quantity}</td>
                  <td className="mt-mono">{m.amount ? euro(m.amount) : '—'}</td>
                  <td className="muted">{m.note || '—'}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(m)} className="icon-btn"><Pencil size={13} /></button>
                    <button onClick={() => onRemove(m.id)} className="icon-btn"><Trash2 size={13} /></button>
                  </td>
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
      <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#6B7280' }}>{label}</span>
      {children}
    </label>
  );
}

function MockupUploadField({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = useRef(`mockup-upload-${uid()}`).current;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!supabase) {
      setError('Subida de imágenes requiere Supabase conectado.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const path = `${Date.now()}-${uid()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
      const { error: upErr } = await supabase.storage.from('mockups').upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('mockups').getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (err) {
      setError('No se pudo subir la imagen. ¿Creaste el bucket "mockups" en Supabase?');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label="Mockup / imagen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {value ? (
          <div style={{ position: 'relative' }}>
            <img src={value} alt="mockup" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 5, border: '1.4px solid #E1E3E8' }} />
            <button type="button" onClick={() => onChange('')} className="icon-btn" style={{ position: 'absolute', top: -8, right: -8, background: '#FFFFFF', border: '1.4px solid #E1E3E8', borderRadius: '50%', padding: 2 }}>
              <X size={10} />
            </button>
          </div>
        ) : (
          <ImageOff size={18} color="#6B7280" />
        )}
        <label htmlFor={inputId} className="mt-btn" style={{ cursor: 'pointer' }}>
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Subiendo…' : value ? 'Cambiar' : 'Subir imagen'}
        </label>
        <input id={inputId} type="file" accept="image/*,application/pdf" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </div>
      {error && <span className="mt-mono" style={{ fontSize: 10, color: '#D8493F', maxWidth: 160 }}>{error}</span>}
    </Field>
  );
}

function Productos({ products, stats, providers, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20', providerId: '', weight: '', unitsPerPackage: '', mockupUrl: '' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd({
      name: form.name, category: form.category || 'Merch', price: Number(form.price) || 0, invested: Number(form.invested) || 0,
      initialStock: Number(form.initialStock) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 20,
      providerId: form.providerId, weight: form.weight, unitsPerPackage: form.unitsPerPackage, mockupUrl: form.mockupUrl,
    });
    setForm({ name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20', providerId: '', weight: '', unitsPerPackage: '', mockupUrl: '' });
  };
  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Categoría">
            <input className="mt-input" list="categorias-existentes" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <datalist id="categorias-existentes">
              {[...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Precio unit. (€)"><input className="mt-input" type="number" step="0.01" style={{ width: 100 }} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Invertido (€)"><input className="mt-input" type="number" step="0.01" style={{ width: 100 }} value={form.invested} onChange={(e) => setForm({ ...form, invested: e.target.value })} /></Field>
          <Field label="Stock inicial"><input className="mt-input" type="number" style={{ width: 100 }} value={form.initialStock} onChange={(e) => setForm({ ...form, initialStock: e.target.value })} /></Field>
          <Field label="Alertar si baja de">
            <input className="mt-input" type="number" style={{ width: 90 }} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
          </Field>
          <Field label="Proveedor">
            <select className="mt-input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
              <option value="">—</option>
              {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
          </Field>
          <Field label="Peso / medida"><input className="mt-input" style={{ width: 100 }} placeholder="ej. 250g" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
          <Field label="Uds. por paquete"><input className="mt-input" type="number" style={{ width: 100 }} value={form.unitsPerPackage} onChange={(e) => setForm({ ...form, unitsPerPackage: e.target.value })} /></Field>
          <MockupUploadField value={form.mockupUrl} onChange={(url) => setForm({ ...form, mockupUrl: url })} />
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {stats.map((p) => {
          const threshold = Number(p.lowStockThreshold) || 20;
          const isLow = p.stockActual > 0 && p.stockActual < threshold;
          const movido = Math.max(0, Number(p.initialStock) - p.stockActual);
          const revenueEstimado = movido * Number(p.price || 0);
          const provider = providers.find((pr) => pr.id === p.providerId);
          return (
            <Card key={p.id} style={{ padding: 14, flex: '1 1 240px', borderColor: isLow ? '#D8493F' : '#E1E3E8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {p.mockupUrl && (
                    <img src={p.mockupUrl} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 5, border: '1.4px solid #E1E3E8', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.name}
                      {isLow && <AlertTriangle size={13} color="#D8493F" />}
                    </div>
                    <div className="mt-mono muted" style={{ fontSize: 11 }}>{p.category}</div>
                  </div>
                </div>
                <button onClick={() => onRemove(p.id)} className="icon-btn"><Trash2 size={13} /></button>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div className="mt-mono" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span className="muted">Precio</span><span>{euro(p.price)}</span>
                <span className="muted">Invertido</span><span>{euro(p.invested)}</span>
                <span className="muted">Stock inicial</span><span>{p.initialStock}</span>
                <span className="muted">Stock actual</span><span style={{ color: isLow ? '#D8493F' : 'inherit', fontWeight: isLow ? 700 : 400 }}>{p.stockActual}</span>
                <span className="muted">Umbral alerta</span><span>{threshold}</span>
                {p.weight && (<><span className="muted">Peso</span><span>{p.weight}</span></>)}
                {p.unitsPerPackage && (<><span className="muted">Uds/paquete</span><span>{p.unitsPerPackage}</span></>)}
                <span className="muted">Proveedor</span><span>{provider?.name || '—'}</span>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase' }}>Revenue estimado</span>
                <span className="mt-mono" style={{ fontSize: 15, fontWeight: 700, color: '#B8791A' }}>{euro(revenueEstimado)}</span>
              </div>
              <div className="mt-mono muted" style={{ fontSize: 10, marginTop: 2, marginBottom: isLow ? 10 : 0 }}>({movido} uds movidas × {euro(p.price)})</div>
              {isLow && <PedirMasButton product={p} provider={provider} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PedirMasButton({ product, provider }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-mono"
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', background: '#FBEAE9', border: '1.4px solid #D8493F', color: '#B23A31', borderRadius: 5, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        <Mail size={13} /> Pedir más
      </button>
    );
  }

  return (
    <div style={{ background: '#F7F7F8', border: '1.4px dashed #E1E3E8', borderRadius: 6, padding: 10 }}>
      {!provider?.email ? (
        <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Este producto no tiene proveedor con email cargado. Agregalo en la pestaña Proveedores.</p>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Field label="Cantidad">
            <input className="mt-input" type="number" min="1" style={{ width: 80 }} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <a
            className="mt-btn"
            style={{ textDecoration: 'none', opacity: qty ? 1 : 0.5, pointerEvents: qty ? 'auto' : 'none' }}
            href={buildOrderMailto(product, provider, qty)}
            onClick={() => setTimeout(() => setOpen(false), 300)}
          >
            <Mail size={13} /> Abrir mail
          </a>
        </div>
      )}
      <button onClick={() => setOpen(false)} className="icon-btn" style={{ marginTop: 6, fontSize: 11 }}>Cancelar</button>
    </div>
  );
}

function Ubicaciones({ locations, products, movements, people, onAdd, onRemove, onAddMovement, onUpdateMovement, onRemoveMovement }) {
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
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderColor: selectedId === l.id ? '#3D7A5C' : '#E1E3E8' }}
          >
            <Store size={15} color="#3D7A5C" />
            <span style={{ fontWeight: 600 }}>{l.name}</span>
            <span className="mt-mono muted" style={{ fontSize: 11 }}>{l.type}</span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(l.id); }} className="icon-btn" style={{ marginLeft: 4 }}><X size={13} /></button>
          </Card>
        ))}
      </div>

      {selected && <LocationDetail location={selected} products={products} movements={movements} people={people} onClose={() => setSelectedId(null)} onAddMovement={onAddMovement} onUpdateMovement={onUpdateMovement} onRemoveMovement={onRemoveMovement} />}
    </div>
  );
}

function LocationDetail({ location, products, movements, people, onClose, onAddMovement, onUpdateMovement, onRemoveMovement }) {
  const lm = movements.filter((m) => m.locationId === location.id);
  const [quick, setQuick] = useState({ productId: products[0]?.id || '', personId: people[0]?.id || '', type: 'entrega', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const [historyOpen, setHistoryOpen] = useState(false);

  const submitQuick = (e) => {
    e.preventDefault();
    if (!quick.productId || !quick.quantity) return;
    const qty = Number(quick.quantity);
    if (['venta', 'fallada', 'regalada'].includes(quick.type)) {
      const product = products.find((p) => p.id === quick.productId);
      if (product) {
        const currentStock = getProductStock(product, movements);
        if (qty > currentStock) {
          const ok = window.confirm(`Ojo: esto va a dejar el stock de "${product.name}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    onAddMovement({ productId: quick.productId, locationId: location.id, personId: quick.personId, type: quick.type, quantity: qty, amount: Number(quick.amount) || 0, date: quick.date, note: '' });
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
          <div className="mt-mono" style={{ fontSize: 16, fontWeight: 600, color: '#3D7A5C' }}>{euro(totalRecaudado)}</div>
        </div>
      </div>

      <div className="mt-mono" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7280', marginBottom: 8 }}>Agregar producto a {location.name}</div>
      <form onSubmit={submitQuick} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 18, padding: 12, background: '#F7F7F8', borderRadius: 6, border: '1.5px dashed #E1E3E8' }}>
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
          fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: '#6B7280',
        }}
      >
        <ChevronDown size={14} style={{ transform: historyOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        Historial en este local ({lm.length})
      </button>
      {historyOpen && (
        <div style={{ overflowX: 'auto' }}>
          <table className="mt-table">
            <thead><tr><th>Fecha</th><th>Producto</th><th>Quién</th><th>Tipo</th><th>Cant.</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
            <tbody>
              {lm.length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: 12 }}>Sin movimientos.</td></tr>}
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
                    <td><button onClick={() => onRemoveMovement(m.id)} className="icon-btn"><Trash2 size={13} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-mono muted" style={{ fontSize: 10, marginTop: 8 }}>Para editar un movimiento (no solo borrarlo), hacelo desde el tab Movimientos.</p>
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
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 440 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Rocío" required /></Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar persona</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {people.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay personas cargadas.</p>}
        {people.map((u) => {
          const count = movements.filter((m) => m.personId === u.id).length;
          return (
            <Card key={u.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <User size={15} color="#3D7A5C" />
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

function Proveedores({ providers, products, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    onAdd(form);
    setForm({ name: '', email: '', phone: '', notes: '' });
  };
  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 520 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Email"><input className="mt-input" type="email" placeholder="pedidos@proveedor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="mt-input" style={{ width: 130 }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Notas"><input className="mt-input" placeholder="opcional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <button type="submit" className="mt-btn"><Plus size={14} /> Agregar</button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {providers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay proveedores cargados.</p>}
        {providers.map((pr) => {
          const linked = products.filter((p) => p.providerId === pr.id);
          return (
            <Card key={pr.id} style={{ padding: 14, flex: '1 1 220px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Truck size={15} color="#3D7A5C" />
                  <span style={{ fontWeight: 700 }}>{pr.name}</span>
                </div>
                <button onClick={() => onRemove(pr.id)} className="icon-btn"><Trash2 size={13} /></button>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div className="mt-mono" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>{pr.email || <span className="muted">sin email</span>}</span>
                {pr.phone && <span className="muted">{pr.phone}</span>}
                {pr.notes && <span className="muted" style={{ fontStyle: 'italic' }}>{pr.notes}</span>}
                <span className="muted" style={{ marginTop: 4 }}>{linked.length} producto{linked.length === 1 ? '' : 's'} asociado{linked.length === 1 ? '' : 's'}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  .mt-root { font-family: 'Inter', sans-serif; background: #EDEEF1; color: #16181D; }
  .mt-display { font-family: 'Inter', sans-serif; }
  .mt-mono { font-family: 'Inter', sans-serif; }
  .muted { color: #6B7280; }
  .perforation { background: #EDEEF1; height: 1px; }
  .tag-card { position: relative; border: 1px solid #EDEEF1; background: #FFFFFF; border-radius: 14px; box-shadow: 0 1px 2px rgba(16,20,24,0.04), 0 1px 1px rgba(16,20,24,0.03); }
  .mt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .mt-table th { text-align: left; font-family: 'Inter', sans-serif; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: #9CA3AF; font-weight: 600; padding: 10px 14px; border-bottom: 1px solid #EDEEF1; }
  .mt-table td { padding: 11px 14px; border-bottom: 1px solid #F3F4F6; }
  .mt-table tr:last-child td { border-bottom: none; }
  .mt-input { box-sizing: border-box; height: 38px; border: 1px solid #E1E3E8; background: #FFFFFF; border-radius: 9px; padding: 0 10px; font-size: 13px; font-family: 'Inter', sans-serif; color: #16181D; }
  .mt-input:focus { outline: 2px solid #3D7A5C; outline-offset: 1px; }
  .mt-btn { box-sizing: border-box; height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #3D7A5C; color: #FFFFFF; border: none; border-radius: 9px; padding: 0 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; box-shadow: 0 1px 2px rgba(16,20,24,0.08); transition: background .15s ease, box-shadow .15s ease, transform .1s ease; white-space: nowrap; flex-shrink: 0; }
  .mt-btn:hover { background: #2F6349; box-shadow: 0 4px 12px rgba(61,122,92,0.28); transform: translateY(-1px); }
  .mt-btn:active { transform: translateY(0); box-shadow: 0 1px 2px rgba(16,20,24,0.08); }
  .icon-btn { background: none; border: none; color: #9CA3AF; cursor: pointer; padding: 4px; display: flex; }
  .icon-btn:hover { color: #D8493F; }
  .tab-btn:hover { color: #16181D; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
`;

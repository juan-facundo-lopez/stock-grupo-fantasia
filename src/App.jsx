import { useState, useEffect, useLayoutEffect, useCallback, useRef, useId } from 'react';
import { Plus, Trash2, Package, TrendingUp, AlertTriangle, Store, Warehouse, LayoutGrid, ListPlus, Tags, X, Loader2, ChevronDown, User, Users, Wifi, WifiOff, Truck, Mail, Upload, ImageOff, Pencil, Download, LogIn, LogOut, ShieldAlert, Menu, Zap, Minus, Undo2, Check, MapPin, MessageCircle } from 'lucide-react';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'merch-tracker-v1';

// Únicos mails autorizados a entrar. La restricción real (a prueba de manipulación)
// vive en las políticas RLS de Supabase; esto es solo para dar un mensaje claro en pantalla.
const ALLOWED_EMAILS = ['jflopezsigon@gmail.com', 'gaston.1693@gmail.com', 'nathaliebatatin@gmail.com', 'rodrigomontecinosaguilar@gmail.com'];

const seedData = {
  products: [],
  providers: [],
  locations: [],
  people: [],
  movements: [],
};

const TYPE_META = {
  entrega: { label: 'Entrega a punto de venta', color: '#3E6B8A' },
  venta: { label: 'Venta', color: '#3D7A5C' },
  fallada: { label: 'Fallada', color: '#D8493F' },
  regalada: { label: 'Regalada', color: '#B8791A' },
  ingreso: { label: 'Ingreso / restock (compra nueva)', color: '#6B4F8A' },
};

// Los valores internos ('restaurante' / 'oficina') no cambian — así los datos que ya
// cargó el equipo siguen funcionando. Lo único que cambia es cómo se muestran en pantalla,
// para que el software no quede atado al rubro gastronómico.
const LOCATION_TYPE_META = {
  restaurante: { label: 'Punto de venta', icon: Store },
  oficina: { label: 'Almacén', icon: Warehouse },
};

const euro = (n) => `€${(Number(n) || 0).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);
const confirmDelete = (msg) => window.confirm(msg || '¿Seguro que querés eliminar esto? No se puede deshacer.');
// Búsqueda de Google Maps por texto — no hace falta API key ni configuración extra.
const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// Código de país para armar el link de WhatsApp. "Otro" se usa cuando el número ya se
// carga completo, con su propio código internacional incluido (ej. +39 para Italia).
const PHONE_COUNTRIES = [
  { code: '+54', label: 'Argentina (+54)' },
  { code: '+34', label: 'España (+34)' },
  { code: '', label: 'Otro (número completo)' },
];

// Arma el link de WhatsApp a partir del teléfono cargado y el país elegido. Si el número
// ya viene con un "+" adelante (código incluido a mano), lo respeta tal cual. Si no,
// le antepone el código del país y descarta un 0 inicial (común al escribir en local).
function waUrl(phone, phoneCountry) {
  if (!phone) return null;
  const trimmed = phone.trim();
  const full = trimmed.startsWith('+') ? trimmed : `${phoneCountry || ''}${trimmed.replace(/^0+/, '')}`;
  const digits = full.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

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
    const entrega = pm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
    const stockActual = Number(p.initialStock) + ingreso - vendido - fallada - regalada;
    // Stock físicamente disponible en el depósito para entregar a un punto de venta:
    // sube con "ingreso" y baja con "entrega" (no con venta/fallada/regalada, porque esas
    // unidades ya salieron del depósito en el momento de la entrega, no al venderse).
    const stockDeposito = Number(p.initialStock) + ingreso - entrega;
    return { ...p, vendido, recaudado, fallada, regalada, stockActual, stockDeposito };
  });
}

function Card({ children, style, className = '', onClick }) {
  return (
    <div className={`tag-card ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

// Microinteracción de confirmación: al llamar trigger(), el botón (ref) muestra
// un "✓ Listo" que reemplaza momentáneamente su contenido normal. Se dispara a mano
// justo después de que la acción realmente se guardó (no en el click en sí), para
// no mostrar una confirmación falsa si el formulario todavía no es válido.
function useConfirmMorph() {
  const ref = useRef(null);
  const trigger = () => {
    const btn = ref.current;
    if (!btn) return;
    const label = btn.querySelector('.btn-label');
    const check = btn.querySelector('.btn-check');
    if (!label || !check) return;
    label.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.5)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    check.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 250, delay: 150, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
    setTimeout(() => {
      check.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.5)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      label.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 250, delay: 150, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
    }, 1100);
  };
  return [ref, trigger];
}

function ConfirmContent({ children }) {
  return (
    <>
      <span className="btn-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{children}</span>
      <span className="btn-check" style={{ position: 'absolute', inset: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0 }}>
        <Check size={14} /> Listo
      </span>
    </>
  );
}

// Reemplaza al window.confirm() nativo (que se ve feo y desentona con el resto de la app) por un
// modal propio, con la misma estética que el resto de las tarjetas. Uso: const { confirm, dialog } =
// useConfirmDialog(); en el JSX se renderiza {dialog}; y en el handler: if (!(await confirm('¿Seguro?'))) return;
function useConfirmDialog() {
  const [pending, setPending] = useState(null); // { message }
  const resolveRef = useRef(null);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending({ message });
    });
  }, []);

  const answer = (value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  };

  const dialog = pending ? (
    <div
      onClick={() => answer(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,20,24,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tag-card"
        style={{ maxWidth: 380, width: '100%', padding: 18 }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
          <AlertTriangle size={18} color="#D8493F" style={{ flexShrink: 0, marginTop: 1 }} />
          <p className="mt-mono" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{pending.message}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => answer(false)} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1.4px solid #E1E3E8' }}>
            Cancelar
          </button>
          <button type="button" onClick={() => answer(true)} className="mt-btn" style={{ background: '#D8493F' }}>
            Confirmar igual
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

export default function MerchTracker() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState('');
  const [session, setSession] = useState(undefined); // undefined = verificando, null = sin sesión
  const [authError, setAuthError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const skipNextRealtime = useRef(false);

  const cloudOn = !!supabase;
  const userEmail = session?.user?.email || '';
  // Google ya manda el nombre y la foto de perfil junto con la sesión — no hace falta
  // pedir nada aparte, solo mostrarlo.
  const userMeta = session?.user?.user_metadata || {};
  const userName = userMeta.full_name || userMeta.name || userEmail;
  const userAvatar = userMeta.avatar_url || userMeta.picture || '';
  const isAllowed = !cloudOn || ALLOWED_EMAILS.includes(userEmail);
  const readyForData = !cloudOn || (session && isAllowed);

  // Sesión de Google (solo aplica cuando hay Supabase conectado)
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cada vez que alguien del equipo (mail autorizado) inicia sesión, guardamos/actualizamos
  // su perfil (nombre y foto de Google) en la tabla `profiles` de Supabase. Así "Personas"
  // puede mostrar automáticamente a la gente del equipo sin tener que cargarla a mano.
  useEffect(() => {
    if (!supabase || !session?.user || !isAllowed) return;
    const u = session.user;
    const meta = u.user_metadata || {};
    supabase.from('profiles').upsert({
      id: u.id,
      email: u.email,
      full_name: meta.full_name || meta.name || '',
      avatar_url: meta.avatar_url || meta.picture || '',
      updated_at: new Date().toISOString(),
    }).then(({ error }) => { if (error) console.error('No se pudo sincronizar el perfil:', error.message); });
  }, [session?.user?.id, isAllowed]);

  // Lista de personas del equipo con cuenta de Google vinculada (para Personas y los
  // selectores de "Quién"). Si la tabla `profiles` todavía no existe en Supabase, esto
  // simplemente no trae nada y la app sigue funcionando con las personas cargadas a mano.
  const [teamProfiles, setTeamProfiles] = useState([]);
  useEffect(() => {
    if (!supabase || !readyForData) { setTeamProfiles([]); return; }
    supabase.from('profiles').select('id, email, full_name, avatar_url, avatar_override').in('email', ALLOWED_EMAILS)
      .then(({ data: rows, error }) => { if (!error && rows) setTeamProfiles(rows); });
  }, [readyForData]);

  // Foto de perfil propia que la persona eligió a mano, si eligió alguna — se guarda
  // aparte de `avatar_url` (que sigue siendo la foto de Google, y se sigue actualizando
  // sola en cada login) para poder "volver a la foto de Google" sin perderla.
  const ownAvatarOverride = teamProfiles.find((tp) => tp.id === session?.user?.id)?.avatar_override || '';

  // Actualiza (o borra, pasando '') la foto elegida a mano para la persona logueada.
  // Solo toca su propia fila (RLS ya restringe `profiles` a auth.uid() = id, igual que
  // hace el upsert de arriba con la foto de Google).
  const updateOwnAvatar = useCallback(async (url) => {
    if (!supabase || !session?.user) return { error: 'No hay sesión.' };
    const { error } = await supabase.from('profiles').update({ avatar_override: url || null }).eq('id', session.user.id);
    if (!error) {
      setTeamProfiles((prev) => prev.map((tp) => (tp.id === session.user.id ? { ...tp, avatar_override: url || null } : tp)));
    }
    return { error: error?.message || null };
  }, [session?.user?.id]);

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
  const totalStockDeposito = stats.reduce((s, p) => s + p.stockDeposito, 0);
  const lowStock = stats.filter((p) => p.stockDeposito > 0 && p.stockDeposito < (Number(p.lowStockThreshold) || 20));

  // "Quién" combina a la gente del equipo con cuenta de Google (automático) con las
  // personas cargadas a mano (para casos sin cuenta, como ayuda puntual en un evento).
  const manualPeople = data.people || [];
  const teamPeople = teamProfiles.map((tp) => ({ id: tp.id, name: tp.full_name || tp.email || 'Sin nombre', email: tp.email, avatarUrl: tp.avatar_override || tp.avatar_url, hasAvatarOverride: !!tp.avatar_override, isTeamAccount: true }));
  const people = [...teamPeople, ...manualPeople];

  const addProduct = (product) => persist({ ...data, products: [...data.products, { ...product, id: uid() }] });
  const updateProduct = (id, updates) => persist({ ...data, products: data.products.map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  const removeProduct = (id) => {
    if (!confirmDelete('¿Eliminar este producto? También se van a borrar todos sus movimientos registrados.')) return;
    persist({ ...data, products: data.products.filter((p) => p.id !== id), movements: data.movements.filter((m) => m.productId !== id) });
  };
  const addLocation = (loc) => persist({ ...data, locations: [...data.locations, { ...loc, id: uid() }] });
  const updateLocation = (id, updates) => persist({ ...data, locations: data.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)) });
  const removeLocation = (id) => {
    if (!confirmDelete('¿Eliminar este punto de venta/ubicación?')) return;
    persist({ ...data, locations: data.locations.filter((l) => l.id !== id) });
  };
  const addPerson = (person) => persist({ ...data, people: [...(data.people || []), { ...person, id: uid() }] });
  const removePerson = (id) => {
    if (!confirmDelete('¿Eliminar esta persona del equipo?')) return;
    persist({ ...data, people: (data.people || []).filter((u) => u.id !== id) });
  };
  const addProvider = (provider) => persist({ ...data, providers: [...(data.providers || []), { ...provider, id: uid() }] });
  const updateProvider = (id, updates) => persist({ ...data, providers: (data.providers || []).map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  const removeProvider = (id) => {
    if (!confirmDelete('¿Eliminar este proveedor?')) return;
    persist({ ...data, providers: (data.providers || []).filter((p) => p.id !== id) });
  };
  // Si mv ya trae un id (ej. "Venta rápida", que lo necesita al toque para poder deshacer) se respeta; si no, se genera uno.
  const addMovement = (mv) => persist({ ...data, movements: [{ id: uid(), ...mv }, ...data.movements] });
  const updateMovement = (id, updates) => persist({ ...data, movements: data.movements.map((m) => (m.id === id ? { ...m, ...updates } : m)) });
  const removeMovement = (id) => {
    if (!confirmDelete('¿Eliminar este movimiento? No se puede deshacer.')) return;
    persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });
  };
  // Sin confirmación: para deshacer una venta recién cargada desde "Venta rápida" (mistap inmediato).
  const undoMovement = (id) => persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });

  return (
    <div className="mt-root" style={{ minHeight: '100%' }}>
      <style>{baseStyles}</style>

      {!mobileNavOpen && (
        <button onClick={() => setMobileNavOpen(true)} className="mt-hamburger" aria-label="Abrir menú">
          <Menu size={18} />
        </button>
      )}
      {mobileNavOpen && <div className="mt-overlay" onClick={() => setMobileNavOpen(false)} />}

      <nav className={`mt-sidebar${mobileNavOpen ? ' mt-sidebar-open' : ''}`} style={{ position: 'fixed', top: 16, left: 16, bottom: 16, width: 208, background: '#FFFFFF', border: '1px solid #EDEEF1', borderRadius: 16, boxShadow: '0 1px 2px rgba(16,20,24,0.04), 0 1px 1px rgba(16,20,24,0.03)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 16px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#16181D', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>M</div>
          <h1 className="mt-display" style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: '#16181D', letterSpacing: '-0.2px', lineHeight: 1.15 }}>Merch Tracker</h1>
          <button onClick={() => setMobileNavOpen(false)} className="mt-drawer-close icon-btn" style={{ marginLeft: 'auto' }} aria-label="Cerrar menú">
            <X size={16} />
          </button>
        </div>
        <span className="mt-mono" style={{ fontSize: 10.5, color: saving ? '#B8791A' : '#9CA3AF', padding: '0 8px 4px' }}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        <span className="mt-mono" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 14px', color: cloudOn ? '#3D7A5C' : '#9CA3AF' }}>
          {cloudOn ? <Wifi size={11} /> : <WifiOff size={11} />} {cloudOn ? 'compartido (Supabase)' : 'solo local'}
        </span>
        <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 1.5, color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600, padding: '0 10px 6px' }}>Menú</span>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, badge: lowStock.length },
          { id: 'venta-rapida', label: 'Venta rápida', icon: Zap },
          { id: 'movimientos', label: 'Movimientos', icon: ListPlus },
          { id: 'productos', label: 'Productos', icon: Package },
          { id: 'ubicaciones', label: 'Puntos de venta', icon: Store },
          { id: 'personas', label: 'Personas', icon: Users },
          { id: 'proveedores', label: 'Proveedores', icon: Truck },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={(e) => {
              const icon = e.currentTarget.querySelector('svg');
              if (icon) {
                icon.animate(
                  [
                    { transform: 'scale(1)' },
                    { transform: 'scale(0.75)', offset: 0.35 },
                    { transform: 'scale(1.18)', offset: 0.65 },
                    { transform: 'scale(1)' },
                  ],
                  { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }
                );
              }
              setTab(id);
              setMobileNavOpen(false);
            }}
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
          <div style={{ marginTop: 'auto' }}>
            <div className="perforation" style={{ margin: '10px 8px' }} />
            <button
              onClick={signOut}
              className="mt-mono"
              title={userEmail}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', fontSize: 12.5,
                border: 'none', background: 'transparent', color: '#9CA3AF',
                borderRadius: 8, cursor: 'pointer', fontWeight: 500, width: '100%', textAlign: 'left',
              }}
            >
              {(ownAvatarOverride || userAvatar) ? (
                <img src={ownAvatarOverride || userAvatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <User size={14} style={{ flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>
              <LogOut size={13} style={{ flexShrink: 0 }} />
            </button>
          </div>
        )}
      </nav>

      <div className="mt-content" style={{ marginLeft: 240, paddingTop: 16 }}>
        <main className="mt-main" style={{ padding: '0 20px 40px' }}>
          {toast && (
            <div className="mt-mono" style={{ background: '#FBEAE9', border: '1px solid #F5C6C2', color: '#B23A31', padding: '10px 14px', borderRadius: 12, fontSize: 12.5, marginBottom: 16 }}>
              {toast}
            </div>
          )}

          {tab === 'dashboard' && (
            <Dashboard stats={stats} totalRecaudado={totalRecaudado} totalVendido={totalVendido} totalInvertido={totalInvertido} totalStock={totalStock} totalStockDeposito={totalStockDeposito} lowStock={lowStock} locations={data.locations} movements={data.movements} />
          )}
          {tab === 'venta-rapida' && (
            <VentaRapida stats={stats} locations={data.locations} people={people} movements={data.movements} onAdd={addMovement} onUndo={undoMovement} onNavigate={setTab} />
          )}
          {tab === 'movimientos' && (
            <Movimientos data={data} people={people} onAdd={addMovement} onUpdate={updateMovement} onRemove={removeMovement} onNavigate={setTab} />
          )}
          {tab === 'productos' && (
            <Productos products={data.products} stats={stats} providers={data.providers || []} onAdd={addProduct} onUpdate={updateProduct} onRemove={removeProduct} />
          )}
          {tab === 'ubicaciones' && (
            <Ubicaciones locations={data.locations} products={data.products} movements={data.movements} people={people} onAdd={addLocation} onUpdate={updateLocation} onRemove={removeLocation} onAddMovement={addMovement} onUpdateMovement={updateMovement} onRemoveMovement={removeMovement} />
          )}
          {tab === 'personas' && (
            <Personas teamPeople={teamPeople} manualPeople={manualPeople} movements={data.movements} onAdd={addPerson} onRemove={removePerson} currentUserId={session?.user?.id} onUpdateAvatar={updateOwnAvatar} />
          )}
          {tab === 'proveedores' && (
            <Proveedores providers={data.providers || []} products={data.products} onAdd={addProvider} onUpdate={updateProvider} onRemove={removeProvider} />
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

function Dashboard({ stats, totalRecaudado, totalVendido, totalInvertido, totalStock, totalStockDeposito, lowStock, locations, movements }) {
  const restaurantes = locations.filter((l) => l.type === 'restaurante');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dateFilterActive = !!(dateFrom || dateTo);

  // El filtro de fecha solo afecta a los números de actividad (ventas, recaudado y sus
  // desgloses). Stock restante y las alertas de stock bajo siguen mostrando siempre el
  // estado real actual, para no dar una falsa sensación de stock según el rango elegido.
  const filteredMovements = dateFilterActive
    ? movements.filter((m) => (!dateFrom || m.date >= dateFrom) && (!dateTo || m.date <= dateTo))
    : movements;

  const filteredStats = stats.map((p) => {
    const pm = filteredMovements.filter((m) => m.productId === p.id);
    const vendido = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
    const recaudado = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
    const fallada = pm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
    const regalada = pm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
    return { ...p, vendido, recaudado, fallada, regalada };
  });

  const totalRecaudadoFiltered = dateFilterActive ? filteredStats.reduce((s, p) => s + p.recaudado, 0) : totalRecaudado;
  const totalVendidoFiltered = dateFilterActive ? filteredStats.reduce((s, p) => s + p.vendido, 0) : totalVendido;

  return (
    <div>
      <Card style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Desde"><input className="mt-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input className="mt-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          {dateFilterActive && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="mt-mono"
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FBEAE9', border: '1.4px solid #D8493F', color: '#B23A31', borderRadius: 5, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <X size={13} /> Quitar filtro
            </button>
          )}
        </div>
        {dateFilterActive && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8, marginBottom: 0 }}>
            Recaudado, vendido y los desgloses por producto y por punto de venta muestran solo este rango. Stock restante y las alertas de stock bajo siempre reflejan el estado real actual.
          </p>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Recaudado" value={euro(totalRecaudadoFiltered)} accent="#3D7A5C" />
        <KpiCard label="Vendido (uds)" value={totalVendidoFiltered} />
        <KpiCard label="Invertido" value={euro(totalInvertido)} accent="#B8791A" />
        <KpiCard label="Stock restante" value={totalStock} />
        <KpiCard label="Stock en depósito" value={totalStockDeposito} />
      </div>

      {lowStock.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FBEAE9', border: '1px solid #F5C6C2', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
          <AlertTriangle size={15} color="#D8493F" />
          <span className="mt-mono" style={{ fontSize: 12.5, color: '#B23A31' }}>
            Stock bajo en depósito: {lowStock.map((p) => `${p.name} (${p.stockDeposito})`).join(', ')}
          </span>
        </div>
      )}

      <SectionTitle>Por producto</SectionTitle>
      <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
        <table className="mt-table">
          <thead>
            <tr>
              <th>Producto</th><th>Categoría</th><th>Stock</th><th>Stock depósito</th><th>Vendido</th><th>Recaudado</th><th>% Recuperado</th><th>Falladas</th><th>Regaladas</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((p) => {
              const pct = Number(p.invested) > 0 ? (p.recaudado / Number(p.invested)) * 100 : null;
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.mockupUrl ? (
                        <img src={p.mockupUrl} alt={p.name} style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 5, border: '1.4px solid #E1E3E8', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div style={{ width: 26, height: 26, borderRadius: 5, border: '1.4px solid #E1E3E8', background: '#F7F7F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <ImageOff size={12} color="#C7CBD3" />
                        </div>
                      )}
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="mt-mono muted">{p.category}</td>
                  <td className="mt-mono">{p.stockActual}</td>
                  <td className="mt-mono" style={{ color: p.stockDeposito < (Number(p.lowStockThreshold) || 20) ? '#D8493F' : 'inherit' }}>{p.stockDeposito}</td>
                  <td className="mt-mono">{p.vendido}</td>
                  <td className="mt-mono">{euro(p.recaudado)}</td>
                  <td className="mt-mono">
                    {pct === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ minWidth: 34, fontWeight: pct >= 100 ? 700 : 400, color: pct >= 100 ? '#3D7A5C' : 'inherit' }}>{pct.toFixed(0)}%</span>
                        <div style={{ width: 50, height: 5, borderRadius: 3, background: '#EDEEF1', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct >= 100 ? '#3D7A5C' : '#B8791A' }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="mt-mono muted">{p.fallada}</td>
                  <td className="mt-mono muted">{p.regalada}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Por punto de venta</SectionTitle>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {restaurantes.map((loc) => {
          const ventas = filteredMovements.filter((m) => m.locationId === loc.id && m.type === 'venta');
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
          <BarChart data={filteredStats.map((p) => ({ label: p.name, value: p.recaudado }))} color="#3D7A5C" valueFormat={euro} />
        </Card>
        <Card style={{ padding: 16, flex: '1 1 320px' }}>
          <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase', marginBottom: 10 }}>Recaudado por punto de venta</div>
          <BarChart
            data={restaurantes.map((loc) => ({
              label: loc.name,
              value: filteredMovements.filter((m) => m.locationId === loc.id && m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0),
            }))}
            color="#B8791A"
            valueFormat={euro}
          />
        </Card>
      </div>

      <Card style={{ padding: 16, marginBottom: 4 }}>
        <div className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase', marginBottom: 10 }}>Recaudado por día (ventas)</div>
        <TrendChart movements={filteredMovements} />
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

// Stock disponible en el depósito (lo que todavía no se entregó a ningún punto de venta).
function getProductStockDeposito(product, movements) {
  const pm = movements.filter((m) => m.productId === product.id);
  const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const entrega = pm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
  return Number(product.initialStock) + ingreso - entrega;
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

function Movimientos({ data, people, onAdd, onUpdate, onRemove, onNavigate }) {
  const [form, setForm] = useState(() => emptyMovForm(data.products, data.locations, people));
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ productId: '', locationId: '', personId: '', type: '', from: '', to: '' });
  const [confirmRef, triggerConfirm] = useConfirmMorph();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const submit = async (e) => {
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
          const ok = await askConfirm(`Ojo: esto va a dejar el stock de "${product.name}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    if (form.type === 'entrega') {
      const product = data.products.find((p) => p.id === form.productId);
      if (product) {
        let currentDeposito = getProductStockDeposito(product, data.movements);
        if (editingId) {
          const prev = data.movements.find((m) => m.id === editingId);
          if (prev && prev.productId === form.productId && prev.type === 'entrega') currentDeposito += Number(prev.quantity);
        }
        if (qty > currentDeposito) {
          const ok = await askConfirm(`Ojo: en el depósito quedan ${currentDeposito} de "${product.name}" y estás entregando ${qty}. ¿Confirmás igual?`);
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
    triggerConfirm();
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
  const noProducts = data.products.length === 0;
  const noLocations = data.locations.length === 0;

  return (
    <div>
      {confirmDialog}
      {(noProducts || noLocations) && (
        <div className="mt-mono" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FFF8E8', border: '1px solid #F0D9A8', color: '#8A6416', padding: '10px 14px', borderRadius: 12, fontSize: 12.5, marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 200 }}>
            Todavía no cargaste {noProducts && noLocations ? 'productos ni puntos de venta' : noProducts ? 'productos' : 'puntos de venta'} — hace falta al menos uno de cada uno para poder registrar movimientos.
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            {noProducts && (
              <button type="button" onClick={() => onNavigate('productos')} className="mt-mono" style={{ background: 'transparent', border: '1.4px solid #B8791A', color: '#8A6416', borderRadius: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                Ir a Productos
              </button>
            )}
            {noLocations && (
              <button type="button" onClick={() => onNavigate('ubicaciones')} className="mt-mono" style={{ background: 'transparent', border: '1.4px solid #B8791A', color: '#8A6416', borderRadius: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                Ir a Puntos de venta
              </button>
            )}
          </span>
        </div>
      )}

      <Card style={{ padding: 16, marginBottom: 20, borderColor: editingId ? '#B8791A' : '#E1E3E8' }}>
        {editingId && (
          <div className="mt-mono" style={{ fontSize: 11, color: '#B8791A', marginBottom: 10 }}>
            Editando movimiento existente
          </div>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Producto">
            <Select value={form.productId} onChange={(v) => setForm({ ...form, productId: v })} options={data.products.map((p) => ({ value: p.id, label: p.name }))} style={{ width: 160 }} />
          </Field>
          <Field label="Ubicación">
            <Select value={form.locationId} onChange={(v) => setForm({ ...form, locationId: v })} options={data.locations.map((l) => ({ value: l.id, label: l.name }))} style={{ width: 160 }} />
          </Field>
          <Field label="Quién">
            <Select value={form.personId} onChange={(v) => setForm({ ...form, personId: v })} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 140 }} />
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
          <button type="submit" className="mt-btn" ref={confirmRef}>
            <ConfirmContent>
              {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Registrar</>}
            </ConfirmContent>
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
            <Select value={filters.productId} onChange={(v) => setFilters({ ...filters, productId: v })} options={[{ value: '', label: 'Todos' }, ...data.products.map((p) => ({ value: p.id, label: p.name }))]} style={{ width: 160 }} />
          </Field>
          <Field label="Ubicación">
            <Select value={filters.locationId} onChange={(v) => setFilters({ ...filters, locationId: v })} options={[{ value: '', label: 'Todas' }, ...data.locations.map((l) => ({ value: l.id, label: l.name }))]} style={{ width: 160 }} />
          </Field>
          <Field label="Quién">
            <Select value={filters.personId} onChange={(v) => setFilters({ ...filters, personId: v })} options={[{ value: '', label: 'Todos' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
          </Field>
          <Field label="Tipo">
            <Select value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={[{ value: '', label: 'Todos' }, ...Object.entries(TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))]} style={{ width: 140 }} />
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

const QS_LOCATION_KEY = 'merch-tracker-qs-location';
const QS_PERSON_KEY = 'merch-tracker-qs-person';

function VentaRapida({ stats, locations, people, movements, onAdd, onUndo, onNavigate }) {
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
  const setQty = (productId, qty) => setQtyByProduct((q) => ({ ...q, [productId]: Math.max(1, qty) }));

  const registerSale = (product) => {
    if (!locationId) { setFlash({ text: 'Elegí un punto de venta primero.' }); return; }
    const qty = qtyByProduct[product.id] || 1;
    const amount = qty * Number(product.price || 0);
    const movementId = uid();
    onAdd({ id: movementId, productId: product.id, locationId, personId, type: 'venta', quantity: qty, amount, date: today, note: '' });
    setQtyByProduct((q) => ({ ...q, [product.id]: 1 }));
    setFlash({ text: `Vendido: ${qty} × ${product.name} (${euro(amount)})`, movementId });
  };

  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Punto de venta">
            <Select value={locationId} onChange={setLocationId} options={[{ value: '', label: 'Elegir…' }, ...restaurantes.map((l) => ({ value: l.id, label: l.name }))]} style={{ width: 200 }} />
          </Field>
          <Field label="Quién vende">
            <Select value={personId} onChange={setPersonId} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 160 }} />
          </Field>
        </div>
        <div className="mt-mono muted" style={{ fontSize: 11, marginTop: 8 }}>
          Quedan elegidos hasta que los cambies. Tocá "Vender" en un producto para registrar la venta al instante.
        </div>
      </Card>

      {flash && (
        <div className="mt-mono" style={{ background: '#E8F2EC', border: '1px solid #BFE0CC', color: '#3D7A5C', padding: '10px 14px', borderRadius: 12, fontSize: 12.5, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{flash.text}</span>
          {flash.movementId && (
            <button
              onClick={() => { onUndo(flash.movementId); setFlash(null); }}
              className="mt-mono"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1.4px solid #3D7A5C', color: '#3D7A5C', borderRadius: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Undo2 size={12} /> Deshacer
            </button>
          )}
        </div>
      )}

      {restaurantes.length === 0 ? (
        <div className="mt-mono" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FFF8E8', border: '1px solid #F0D9A8', color: '#8A6416', padding: '10px 14px', borderRadius: 12, fontSize: 12.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 200 }}>Todavía no cargaste ningún punto de venta — hace falta al menos uno para poder vender.</span>
          <button type="button" onClick={() => onNavigate('ubicaciones')} className="mt-mono" style={{ background: 'transparent', border: '1.4px solid #B8791A', color: '#8A6416', borderRadius: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
            Ir a Puntos de venta
          </button>
        </div>
      ) : !locationId ? (
        <p className="muted" style={{ fontSize: 13 }}>Elegí un punto de venta arriba para empezar a vender.</p>
      ) : stats.length === 0 ? (
        <div className="mt-mono" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#FFF8E8', border: '1px solid #F0D9A8', color: '#8A6416', padding: '10px 14px', borderRadius: 12, fontSize: 12.5 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 200 }}>Todavía no cargaste ningún producto — hace falta al menos uno para poder vender.</span>
          <button type="button" onClick={() => onNavigate('productos')} className="mt-mono" style={{ background: 'transparent', border: '1.4px solid #B8791A', color: '#8A6416', borderRadius: 5, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
            Ir a Productos
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {stats.map((p) => {
            const qty = qtyByProduct[p.id] || 1;
            const sinStock = p.stockActual <= 0;
            return (
              <Card key={p.id} style={{ padding: 14, flex: '1 1 200px', opacity: sinStock ? 0.5 : 1 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="mt-mono muted" style={{ fontSize: 11, marginBottom: 10 }}>{euro(p.price)} · stock {p.stockActual}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <button type="button" disabled={sinStock} onClick={() => setQty(p.id, qty - 1)} className="icon-btn"><Minus size={13} /></button>
                  <span className="mt-mono" style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{qty}</span>
                  <button type="button" disabled={sinStock} onClick={() => setQty(p.id, qty + 1)} className="icon-btn"><Plus size={13} /></button>
                </div>
                <button
                  type="button"
                  disabled={sinStock}
                  onClick={() => registerSale(p)}
                  className="mt-btn"
                  style={{ width: '100%', justifyContent: 'center', opacity: sinStock ? 0.6 : 1, cursor: sinStock ? 'not-allowed' : 'pointer' }}
                >
                  {sinStock ? 'Sin stock' : <><Zap size={13} /> Vender{qty > 1 ? ` ×${qty}` : ''}</>}
                </button>
              </Card>
            );
          })}
        </div>
      )}
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

// Barra de búsqueda por nombre + orden, reutilizada en Productos, Proveedores y Puntos
// de venta para no repetir el mismo bloque de UI tres veces.
function ListToolbar({ query, onQueryChange, sortValue, onSortChange, sortOptions, placeholder = 'Buscar por nombre…', resultCount }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
      <Field label="Buscar">
        <input className="mt-input" style={{ width: 220 }} placeholder={placeholder} value={query} onChange={(e) => onQueryChange(e.target.value)} />
      </Field>
      <Field label="Ordenar por">
        <Select value={sortValue} onChange={onSortChange} options={sortOptions} style={{ width: 190 }} />
      </Field>
      {typeof resultCount === 'number' && (
        <span className="mt-mono muted" style={{ fontSize: 11.5, marginBottom: 9 }}>{resultCount} resultado{resultCount === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}

// Link a una búsqueda de Google Maps por dirección — no requiere API key ni mapa embebido.
function MapsLink({ address }) {
  if (!address) return null;
  return (
    <a
      href={mapsUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-mono"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#3D7A5C', textDecoration: 'none', fontWeight: 600 }}
    >
      <MapPin size={12} /> Ver en Maps
    </a>
  );
}

// Link directo a un chat de WhatsApp con el teléfono cargado, usando el código de país elegido.
function WhatsAppLink({ phone, phoneCountry }) {
  const url = waUrl(phone, phoneCountry);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-mono"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#25A25A', textDecoration: 'none', fontWeight: 600 }}
    >
      <MessageCircle size={12} /> WhatsApp
    </a>
  );
}

// Dropdown propio (reemplaza <select> nativo) para tener el mismo look que el resto de
// los inputs y poder animar la apertura — el listbox nativo del navegador no se puede
// estilizar. options: [{ value, label }]. Mantiene la misma API value/onChange que un
// select controlado para que el resto del código no cambie.
function Select({ value, onChange, options, placeholder = 'Seleccionar…', style, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKeydown = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeydown, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onKeydown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    const target = el.scrollHeight;
    el.style.overflow = 'hidden';
    const anim = el.animate(
      [{ height: '0px', opacity: 0.4 }, { height: target + 'px', opacity: 1 }],
      { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    anim.onfinish = () => { if (panelRef.current) panelRef.current.style.overflow = ''; };
    const idx = options.findIndex((o) => String(o.value) === String(value));
    setHighlight(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || highlight < 0 || !panelRef.current) return;
    const row = panelRef.current.children[highlight];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const pick = (opt) => {
    if (disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setHighlight(0); }
    else if (e.key === 'End') { e.preventDefault(); setHighlight(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[highlight]) pick(options[highlight]); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  return (
    <div className="mt-select" ref={rootRef} style={style}>
      <div
        className={`mt-select-field${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`mt-select-value${!selected ? ' placeholder' : ''}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className="mt-select-chev" />
      </div>
      {open && (
        <div className="mt-select-panel" ref={panelRef} id={listId} role="listbox">
          {options.map((opt, i) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`mt-select-opt${String(opt.value) === String(value) ? ' selected' : ''}${i === highlight ? ' highlighted' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
            >
              <span className="mt-select-opt-label">{opt.label}</span>
              <Check size={13} className="mt-select-check" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sube un archivo al bucket de Supabase Storage indicado y devuelve su URL pública.
// Compartido por ImageUploadField (mockups de producto, logos) y por el selector de
// foto de perfil en Personas — mismo bucket "mockups", ya creado y probado.
async function uploadToStorage(file, bucket = 'mockups') {
  if (!supabase) throw new Error('Subida de imágenes requiere Supabase conectado.');
  const path = `${Date.now()}-${uid()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return pub.publicUrl;
}

function ImageUploadField({ value, onChange, label = 'Mockup / imagen', accept = 'image/*,application/pdf' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = useRef(`mockup-upload-${uid()}`).current;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadToStorage(file);
      onChange(url);
    } catch (err) {
      setError('No se pudo subir la imagen. ¿Creaste el bucket "mockups" en Supabase?');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {value ? (
          <div style={{ position: 'relative' }}>
            <img src={value} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 5, border: '1.4px solid #E1E3E8' }} />
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
        <input id={inputId} type="file" accept={accept} onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
      </div>
      {error && <span className="mt-mono" style={{ fontSize: 10, color: '#D8493F', maxWidth: 160 }}>{error}</span>}
    </Field>
  );
}

const emptyProductForm = { name: '', category: 'Merch', price: '', invested: '', initialStock: '', lowStockThreshold: '20', providerId: '', weight: '', unitsPerPackage: '', mockupUrl: '' };

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

function Productos({ products, stats, providers, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState(emptyProductForm);
  const [editingId, setEditingId] = useState(null);
  const [confirmRef, triggerConfirm] = useConfirmMorph();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const submit = (e) => {
    e.preventDefault();
    if (!form.name) return;
    const payload = {
      name: form.name, category: form.category || 'Merch', price: Number(form.price) || 0, invested: Number(form.invested) || 0,
      initialStock: Number(form.initialStock) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 20,
      providerId: form.providerId, weight: form.weight, unitsPerPackage: form.unitsPerPackage, mockupUrl: form.mockupUrl,
    };
    if (editingId) {
      onUpdate(editingId, payload);
      setEditingId(null);
    } else {
      onAdd(payload);
    }
    triggerConfirm();
    setForm(emptyProductForm);
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name, category: p.category || 'Merch', price: p.price ? String(p.price) : '', invested: p.invested ? String(p.invested) : '',
      initialStock: p.initialStock ? String(p.initialStock) : '', lowStockThreshold: p.lowStockThreshold ? String(p.lowStockThreshold) : '20',
      providerId: p.providerId || '', weight: p.weight || '', unitsPerPackage: p.unitsPerPackage ? String(p.unitsPerPackage) : '', mockupUrl: p.mockupUrl || '',
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyProductForm);
  };

  const visibleStats = sortProductStats(stats.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())), sortBy);

  return (
    <div>
      <Card style={{ padding: 16, marginBottom: 20, borderColor: editingId ? '#B8791A' : '#E1E3E8' }}>
        {editingId && (
          <div className="mt-mono" style={{ fontSize: 14, fontWeight: 700, color: '#B8791A', marginBottom: 10 }}>
            Editando: {form.name || '—'}
          </div>
        )}
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
            <Select value={form.providerId} onChange={(v) => setForm({ ...form, providerId: v })} options={[{ value: '', label: '—' }, ...providers.map((pr) => ({ value: pr.id, label: pr.name }))]} style={{ width: 160 }} />
          </Field>
          <Field label="Peso / medida"><input className="mt-input" style={{ width: 100 }} placeholder="ej. 250g" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></Field>
          <Field label="Uds. por paquete"><input className="mt-input" type="number" style={{ width: 100 }} value={form.unitsPerPackage} onChange={(e) => setForm({ ...form, unitsPerPackage: e.target.value })} /></Field>
          <ImageUploadField value={form.mockupUrl} onChange={(url) => setForm({ ...form, mockupUrl: url })} />
          <button type="submit" className="mt-btn" ref={confirmRef}>
            <ConfirmContent>
              {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Agregar</>}
            </ConfirmContent>
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1.4px solid #E1E3E8' }}>
              <X size={14} /> Cancelar
            </button>
          )}
        </form>
      </Card>

      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sortValue={sortBy}
        onSortChange={setSortBy}
        sortOptions={PRODUCT_SORT_OPTIONS}
        placeholder="Buscar producto…"
        resultCount={stats.length > 0 ? visibleStats.length : undefined}
      />

      {stats.length > 0 && visibleStats.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>No se encontraron productos para "{query}".</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {visibleStats.map((p) => {
          const threshold = Number(p.lowStockThreshold) || 20;
          const isLow = p.stockDeposito > 0 && p.stockDeposito < threshold;
          const movido = Math.max(0, Number(p.initialStock) - p.stockActual);
          const revenueEstimado = movido * Number(p.price || 0);
          const provider = providers.find((pr) => pr.id === p.providerId);
          return (
            <Card key={p.id} style={{ padding: 14, flex: '1 1 240px', display: 'flex', flexDirection: 'column', borderColor: editingId === p.id ? '#B8791A' : (isLow ? '#D8493F' : '#E1E3E8') }}>
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
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => startEdit(p)} className="icon-btn"><Pencil size={13} /></button>
                  <button onClick={() => onRemove(p.id)} className="icon-btn"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div className="mt-mono" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <span className="muted">Precio</span><span>{euro(p.price)}</span>
                <span className="muted">Invertido</span><span>{euro(p.invested)}</span>
                <span className="muted">Stock inicial</span><span>{p.initialStock}</span>
                <span className="muted">Stock actual</span><span>{p.stockActual}</span>
                <span className="muted">Stock en depósito</span><span style={{ color: isLow ? '#D8493F' : 'inherit', fontWeight: isLow ? 700 : 400 }}>{p.stockDeposito}</span>
                <span className="muted">Umbral alerta</span><span>{threshold}</span>
                {p.weight && (<><span className="muted">Peso</span><span>{p.weight}</span></>)}
                {p.unitsPerPackage && (<><span className="muted">Uds/paquete</span><span>{p.unitsPerPackage}</span></>)}
                <span className="muted">Proveedor</span><span>{provider?.name || '—'}</span>
              </div>
              <div style={{ marginTop: 'auto' }}>
                <div className="perforation" style={{ margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="mt-mono muted" style={{ fontSize: 10.5, textTransform: 'uppercase' }}>Revenue estimado</span>
                  <span className="mt-mono" style={{ fontSize: 15, fontWeight: 700, color: '#B8791A' }}>{euro(revenueEstimado)}</span>
                </div>
                <div className="mt-mono muted" style={{ fontSize: 10, marginTop: 2 }}>({movido} uds movidas × {euro(p.price)})</div>
              </div>
              {isLow && <div style={{ marginTop: 10 }}><PedirMasButton product={p} provider={provider} /></div>}
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

const emptyLocationForm = { name: '', type: 'restaurante', logoUrl: '', address: '', email: '', phone: '', phoneCountry: '+54' };

const LOCATION_SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'type', label: 'Tipo (agrupado)' },
];

function Ubicaciones({ locations, products, movements, people, onAdd, onUpdate, onRemove, onAddMovement, onUpdateMovement, onRemoveMovement }) {
  const [form, setForm] = useState(emptyLocationForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmRef, triggerConfirm] = useConfirmMorph();
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
    triggerConfirm();
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
    <div>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 520, borderColor: editingId ? '#B8791A' : '#E1E3E8' }}>
        {editingId && (
          <div className="mt-mono" style={{ fontSize: 14, fontWeight: 700, color: '#B8791A', marginBottom: 10 }}>
            Editando: {form.name || '—'}
          </div>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={Object.entries(LOCATION_TYPE_META).map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 150 }} />
          </Field>
          <Field label="Email"><input className="mt-input" type="email" placeholder="contacto@ejemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono / WhatsApp">
            <div style={{ display: 'flex', gap: 6 }}>
              <Select value={form.phoneCountry} onChange={(v) => setForm({ ...form, phoneCountry: v })} options={PHONE_COUNTRIES.map((c) => ({ value: c.code, label: c.code || 'Otro' }))} style={{ width: 84 }} />
              <input className="mt-input" placeholder="11 5555-5555" style={{ width: 130 }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </Field>
          <Field label="Dirección"><input className="mt-input" placeholder="opcional" style={{ width: 200 }} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <ImageUploadField value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} label="Logo" accept="image/*" />
          <button type="submit" className="mt-btn" ref={confirmRef}>
            <ConfirmContent>
              {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Agregar</>}
            </ConfirmContent>
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1.4px solid #E1E3E8' }}>
              <X size={14} /> Cancelar
            </button>
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
        <p className="muted" style={{ fontSize: 13 }}>No se encontraron puntos de venta para "{query}".</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: selected ? 20 : 0 }}>
        {visibleLocations.map((l) => {
          const meta = LOCATION_TYPE_META[l.type] || LOCATION_TYPE_META.restaurante;
          const TypeIcon = meta.icon;
          return (
            <Card
              key={l.id}
              onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
              style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', borderColor: editingId === l.id ? '#B8791A' : (selectedId === l.id ? '#3D7A5C' : '#E1E3E8') }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {l.logoUrl ? (
                  <img src={l.logoUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 5, border: '1.4px solid #E1E3E8', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <TypeIcon size={15} color="#3D7A5C" />
                )}
                <span style={{ fontWeight: 600 }}>{l.name}</span>
                <span className="mt-mono muted" style={{ fontSize: 11 }}>{meta.label}</span>
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(l); }} className="icon-btn"><Pencil size={13} /></button>
                  <button onClick={(e) => { e.stopPropagation(); onRemove(l.id); }} className="icon-btn"><X size={13} /></button>
                </div>
              </div>
              {(l.address || l.phone) && (
                <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MapsLink address={l.address} />
                  <WhatsAppLink phone={l.phone} phoneCountry={l.phoneCountry} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {selected && <LocationDetail location={selected} products={products} movements={movements} people={people} onClose={() => setSelectedId(null)} onAddMovement={onAddMovement} onUpdateMovement={onUpdateMovement} onRemoveMovement={onRemoveMovement} />}
    </div>
  );
}

function LocationDetail({ location, products, movements, people, onClose, onAddMovement, onUpdateMovement, onRemoveMovement }) {
  const lm = movements.filter((m) => m.locationId === location.id);
  const [quick, setQuick] = useState({ productId: products[0]?.id || '', personId: people[0]?.id || '', type: 'entrega', quantity: '', amount: '', date: new Date().toISOString().slice(0, 10) });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmRef, triggerConfirm] = useConfirmMorph();
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  const submitQuick = async (e) => {
    e.preventDefault();
    if (!quick.productId || !quick.quantity) return;
    const qty = Number(quick.quantity);
    if (['venta', 'fallada', 'regalada'].includes(quick.type)) {
      const product = products.find((p) => p.id === quick.productId);
      if (product) {
        const currentStock = getProductStock(product, movements);
        if (qty > currentStock) {
          const ok = await askConfirm(`Ojo: esto va a dejar el stock de "${product.name}" en negativo (quedan ${currentStock}, estás cargando ${qty}). ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    if (quick.type === 'entrega') {
      const product = products.find((p) => p.id === quick.productId);
      if (product) {
        const currentDeposito = getProductStockDeposito(product, movements);
        if (qty > currentDeposito) {
          const ok = await askConfirm(`Ojo: en el depósito quedan ${currentDeposito} de "${product.name}" y estás entregando ${qty}. ¿Confirmás igual?`);
          if (!ok) return;
        }
      }
    }
    onAddMovement({ productId: quick.productId, locationId: location.id, personId: quick.personId, type: quick.type, quantity: qty, amount: Number(quick.amount) || 0, date: quick.date, note: '' });
    triggerConfirm();
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
      {confirmDialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {location.logoUrl && (
            <img src={location.logoUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1.4px solid #E1E3E8', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <div>
            <div className="mt-mono muted" style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase' }}>Detalle</div>
            <div className="mt-display" style={{ fontSize: 20, fontWeight: 700 }}>{location.name}</div>
            {location.address && (
              <div className="mt-mono muted" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                {location.address} <MapsLink address={location.address} />
              </div>
            )}
            {(location.email || location.phone) && (
              <div className="mt-mono muted" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
                {location.email && <span>{location.email}</span>}
                {location.phone && <span>{location.phone}</span>}
                <WhatsAppLink phone={location.phone} phoneCountry={location.phoneCountry} />
              </div>
            )}
          </div>
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
          <Select value={quick.productId} onChange={(v) => setQuick({ ...quick, productId: v })} options={products.map((p) => ({ value: p.id, label: p.name }))} style={{ width: 160 }} />
        </Field>
        <Field label="Quién">
          <Select value={quick.personId} onChange={(v) => setQuick({ ...quick, personId: v })} options={[{ value: '', label: '—' }, ...people.map((u) => ({ value: u.id, label: u.name }))]} style={{ width: 140 }} />
        </Field>
        <Field label="Tipo">
          <Select value={quick.type} onChange={(v) => setQuick({ ...quick, type: v })} options={Object.entries(TYPE_META).filter(([k]) => k !== 'ingreso').map(([k, v]) => ({ value: k, label: v.label }))} style={{ width: 140 }} />
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
        <button type="submit" className="mt-btn" ref={confirmRef}>
          <ConfirmContent><Plus size={14} /> Registrar</ConfirmContent>
        </button>
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

// Tarjeta de una persona del equipo dentro de "Personas". Si es la persona logueada
// (isOwn), suma un botón de lápiz para subir su propia foto (queda guardada en
// `avatar_override` en Supabase, aparte de la foto de Google) y, si ya eligió una,
// un botón para volver a la foto de Google.
function TeamMemberCard({ person, count, isOwn, onUpdateAvatar }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = useRef(`avatar-upload-${uid()}`).current;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpdateAvatar) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadToStorage(file);
      const { error: saveErr } = await onUpdateAvatar(url);
      if (saveErr) setError('No se pudo guardar la foto.');
    } catch {
      setError('No se pudo subir la foto. ¿Existe el bucket "mockups" en Supabase?');
    } finally {
      setUploading(false);
    }
  };

  const revert = async () => {
    if (!onUpdateAvatar) return;
    setError('');
    setUploading(true);
    const { error: saveErr } = await onUpdateAvatar('');
    if (saveErr) setError('No se pudo actualizar la foto.');
    setUploading(false);
  };

  return (
    <Card style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} referrerPolicy="no-referrer" />
      ) : (
        <User size={15} color="#3D7A5C" />
      )}
      <div>
        <div style={{ fontWeight: 600 }}>{person.name}</div>
        {person.email && <div className="mt-mono muted" style={{ fontSize: 10.5 }}>{person.email}</div>}
      </div>
      <span className="mt-mono muted" style={{ fontSize: 11, marginLeft: 4 }}>{count} movimiento{count === 1 ? '' : 's'}</span>
      {isOwn && (
        <>
          <label htmlFor={inputId} className="icon-btn" title="Cambiar mi foto" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
          </label>
          <input id={inputId} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
          {person.hasAvatarOverride && (
            <button type="button" onClick={revert} className="icon-btn" title="Volver a la foto de Google" disabled={uploading}>
              <Undo2 size={13} />
            </button>
          )}
        </>
      )}
      {error && <div className="mt-mono" style={{ width: '100%', fontSize: 10, color: '#D8493F' }}>{error}</div>}
    </Card>
  );
}

function Personas({ teamPeople, manualPeople, movements, onAdd, onRemove, currentUserId, onUpdateAvatar }) {
  const [name, setName] = useState('');
  const [confirmRef, triggerConfirm] = useConfirmMorph();
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim() });
    triggerConfirm();
    setName('');
  };
  return (
    <div>
      <SectionTitle>Equipo</SectionTitle>
      <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        Se cargan solas cuando alguien del equipo inicia sesión con Google — no hace falta agregarlas a mano.
        Cada quien puede tocar el lápiz de su propia tarjeta para poner otra foto.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        {teamPeople.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía nadie del equipo inició sesión.</p>}
        {teamPeople.map((u) => {
          const count = movements.filter((m) => m.personId === u.id).length;
          return (
            <TeamMemberCard key={u.id} person={u} count={count} isOwn={u.id === currentUserId} onUpdateAvatar={onUpdateAvatar} />
          );
        })}
      </div>

      <SectionTitle>Agregadas a mano</SectionTitle>
      <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        Para gente sin cuenta de Google (ej. ayuda puntual en un evento).
      </p>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 440 }}>
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Rocío" required /></Field>
          <button type="submit" className="mt-btn" ref={confirmRef}>
            <ConfirmContent><Plus size={14} /> Agregar persona</ConfirmContent>
          </button>
        </form>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {manualPeople.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay personas cargadas a mano.</p>}
        {manualPeople.map((u) => {
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

const emptyProviderForm = { name: '', type: '', email: '', phone: '', address: '', notes: '' };

const PROVIDER_SORT_OPTIONS = [
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'linked-desc', label: 'Más productos asociados primero' },
  { value: 'linked-asc', label: 'Menos productos asociados primero' },
];

function Proveedores({ providers, products, onAdd, onUpdate, onRemove }) {
  const [form, setForm] = useState(emptyProviderForm);
  const [editingId, setEditingId] = useState(null);
  const [confirmRef, triggerConfirm] = useConfirmMorph();
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
    triggerConfirm();
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
    <div>
      <Card style={{ padding: 16, marginBottom: 20, maxWidth: 620, borderColor: editingId ? '#B8791A' : '#E1E3E8' }}>
        {editingId && (
          <div className="mt-mono" style={{ fontSize: 14, fontWeight: 700, color: '#B8791A', marginBottom: 10 }}>
            Editando: {form.name || '—'}
          </div>
        )}
        <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Nombre"><input className="mt-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Tipo">
            <input className="mt-input" list="tipos-proveedor-existentes" placeholder="ej. imprenta" style={{ width: 130 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <datalist id="tipos-proveedor-existentes">
              {[...new Set(providers.map((pr) => pr.type).filter(Boolean))].map((t) => <option key={t} value={t} />)}
            </datalist>
          </Field>
          <Field label="Email"><input className="mt-input" type="email" placeholder="pedidos@proveedor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Teléfono"><input className="mt-input" style={{ width: 130 }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Dirección"><input className="mt-input" placeholder="opcional" style={{ width: 200 }} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notas"><input className="mt-input" placeholder="opcional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <button type="submit" className="mt-btn" ref={confirmRef}>
            <ConfirmContent>
              {editingId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Agregar</>}
            </ConfirmContent>
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="mt-btn" style={{ background: 'transparent', color: '#6B7280', border: '1.4px solid #E1E3E8' }}>
              <X size={14} /> Cancelar
            </button>
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
        <p className="muted" style={{ fontSize: 13 }}>No se encontraron proveedores para "{query}".</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {providers.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Todavía no hay proveedores cargados.</p>}
        {visibleProviders.map((pr) => {
          const linked = pr._linkedCount;
          return (
            <Card key={pr.id} style={{ padding: 14, flex: '1 1 220px', display: 'flex', flexDirection: 'column', borderColor: editingId === pr.id ? '#B8791A' : '#E1E3E8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Truck size={15} color="#3D7A5C" />
                  <div>
                    <span style={{ fontWeight: 700 }}>{pr.name}</span>
                    {pr.type && <div className="mt-mono muted" style={{ fontSize: 11 }}>{pr.type}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => startEdit(pr)} className="icon-btn"><Pencil size={13} /></button>
                  <button onClick={() => onRemove(pr.id)} className="icon-btn"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="perforation" style={{ margin: '10px 0' }} />
              <div className="mt-mono" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>{pr.email || <span className="muted">sin email</span>}</span>
                {pr.phone && <span className="muted">{pr.phone}</span>}
                {pr.address && (
                  <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {pr.address} <MapsLink address={pr.address} />
                  </span>
                )}
                {pr.notes && <span className="muted" style={{ fontStyle: 'italic' }}>{pr.notes}</span>}
              </div>
              <span className="mt-mono muted" style={{ fontSize: 12, marginTop: 'auto', paddingTop: 8 }}>{linked} producto{linked === 1 ? '' : 's'} asociado{linked === 1 ? '' : 's'}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
  .mt-root { font-family: 'Poppins', sans-serif; background: #EDEEF1; color: #16181D; }
  .mt-display { font-family: 'Poppins', sans-serif; }
  .mt-mono { font-family: 'Poppins', sans-serif; }
  .muted { color: #6B7280; }
  .perforation { background: #EDEEF1; height: 1px; }
  .tag-card { position: relative; border: 1px solid #EDEEF1; background: #FFFFFF; border-radius: 14px; box-shadow: 0 1px 2px rgba(16,20,24,0.04), 0 1px 1px rgba(16,20,24,0.03); }
  .mt-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .mt-table th { text-align: left; font-family: 'Poppins', sans-serif; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; color: #9CA3AF; font-weight: 600; padding: 10px 14px; border-bottom: 1px solid #EDEEF1; }
  .mt-table td { padding: 11px 14px; border-bottom: 1px solid #F3F4F6; }
  .mt-table tr:last-child td { border-bottom: none; }
  .mt-input { box-sizing: border-box; height: 38px; border: 1px solid #E1E3E8; background: #FFFFFF; border-radius: 9px; padding: 0 10px; font-size: 13px; font-family: 'Poppins', sans-serif; color: #16181D; }
  .mt-input:focus { outline: 2px solid #3D7A5C; outline-offset: 1px; }

  .mt-select { position: relative; font-family: 'Poppins', sans-serif; }
  .mt-select-field { box-sizing: border-box; width: 100%; height: 38px; border: 1px solid #E1E3E8; background: #FFFFFF; border-radius: 9px; padding: 0 10px; font-size: 13px; color: #16181D; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
  .mt-select-field:hover { border-color: #C7CBD3; }
  .mt-select-field.open { border-color: #3D7A5C; box-shadow: 0 0 0 2px rgba(61,122,92,0.15); }
  .mt-select-field:focus { outline: none; }
  .mt-select-field:focus-visible { outline: 2px solid #3D7A5C; outline-offset: 1px; }
  .mt-select-field.disabled { cursor: not-allowed; opacity: 0.55; }
  .mt-select-chev { color: #9CA3AF; flex-shrink: 0; transition: transform .2s ease; }
  .mt-select-field.open .mt-select-chev { transform: rotate(180deg); color: #3D7A5C; }
  .mt-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mt-select-value.placeholder { color: #9CA3AF; }
  .mt-select-panel { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #FFFFFF; border: 1px solid #EDEEF1; border-radius: 11px; box-shadow: 0 8px 24px rgba(16,20,24,0.12), 0 2px 6px rgba(16,20,24,0.06); padding: 5px; z-index: 30; max-height: 240px; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; }
  .mt-select-opt { font-size: 13px; padding: 9px 10px; border-radius: 7px; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .mt-select-opt:hover, .mt-select-opt.highlighted { background: #F7F7F8; }
  .mt-select-opt.selected { background: #E8F2EC; color: #2F6349; font-weight: 600; }
  .mt-select-opt.selected.highlighted { background: #DCEEE3; }
  .mt-select-opt-label { min-width: 0; white-space: normal; word-break: break-word; line-height: 1.35; }
  .mt-select-opt .mt-select-check { color: #3D7A5C; opacity: 0; width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
  .mt-select-opt.selected .mt-select-check { opacity: 1; }
  .mt-btn { position: relative; box-sizing: border-box; height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #3D7A5C; color: #FFFFFF; border: none; border-radius: 9px; padding: 0 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif; box-shadow: 0 1px 2px rgba(16,20,24,0.08); transition: background .15s ease, box-shadow .15s ease, transform .1s ease; white-space: nowrap; flex-shrink: 0; }
  .mt-btn:hover { background: #2F6349; box-shadow: 0 4px 12px rgba(61,122,92,0.28); transform: translateY(-1px); }
  .mt-btn:active { transform: translateY(0); box-shadow: 0 1px 2px rgba(16,20,24,0.08); }
  .icon-btn { background: none; border: none; color: #9CA3AF; cursor: pointer; padding: 8px; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; border-radius: 8px; }
  .icon-btn:hover { color: #D8493F; background: #F7F7F8; }
  .icon-btn:disabled { cursor: not-allowed; opacity: 0.4; }
  .icon-btn:disabled:hover { background: none; color: #9CA3AF; }
  .tab-btn:hover { color: #16181D; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }

  .mt-hamburger { display: none; position: fixed; top: 16px; left: 16px; z-index: 55; width: 40px; height: 40px; border-radius: 10px; background: #FFFFFF; border: 1px solid #EDEEF1; box-shadow: 0 1px 2px rgba(16,20,24,0.08); align-items: center; justify-content: center; cursor: pointer; color: #16181D; }
  .mt-overlay { display: none; }
  .mt-drawer-close { display: none; }
  @media (max-width: 880px) {
    .mt-hamburger { display: flex; }
    .mt-overlay { display: block; position: fixed; inset: 0; background: rgba(16,20,24,0.35); z-index: 45; }
    .mt-drawer-close { display: flex; }
    .mt-sidebar { transform: translateX(-120%) !important; transition: transform .25s ease; z-index: 50; width: min(82vw, 260px) !important; }
    .mt-sidebar.mt-sidebar-open { transform: translateX(0) !important; box-shadow: 0 10px 40px rgba(16,20,24,0.28); }
    .mt-content { margin-left: 0 !important; padding-top: 64px !important; }
    .mt-main { padding: 0 14px 32px !important; }
  }
  @media (max-width: 480px) {
    .mt-table th, .mt-table td { padding: 8px 10px; }
  }
`;

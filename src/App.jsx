import { useState, useEffect, useLayoutEffect, useCallback, useRef, useId } from 'react';
import { Plus, Trash2, Package, TrendingUp, AlertTriangle, Store, Warehouse, LayoutGrid, ListPlus, Tags, X, Loader2, ChevronDown, User, Users, Wifi, WifiOff, Truck, Mail, Upload, ImageOff, Pencil, Download, LogIn, LogOut, ShieldAlert, Menu, Zap, Minus, Undo2, Check, MapPin, MessageCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { Dashboard } from './components/Dashboard';
import { Productos } from './components/Productos';
import { Movimientos } from './components/Movimientos';
import { VentaRapida } from './components/VentaRapida';
import { Ubicaciones } from './components/Ubicaciones';
import { Personas } from './components/Personas';
import { Proveedores } from './components/Proveedores';
import { Card, useConfirmDialog, useConfirmMorph, ConfirmContent, SectionTitle, Field, ListToolbar, Select, ImageUploadField } from './components/shared';
import {
  euro, uid, mapsUrl, waUrl, computeStats, hasVariants, variantLabel, fullLabel,
  getVariantStock, getVariantStockDeposito, getProductStock, getProductStockDeposito,
  uploadToStorage, uploadErrorMessage,
} from './lib/helpers';

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
  venta: { label: 'Venta', color: '#2563EB' },
  fallada: { label: 'Fallada', color: '#D8493F' },
  regalada: { label: 'Regalada', color: '#EB2563' },
  ingreso: { label: 'Ingreso / restock (compra nueva)', color: '#6B4F8A' },
};

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

  const { confirm: askConfirm, dialog: confirmDialog } = useConfirmDialog();

  if (cloudOn && session === undefined) {
    return (
      <div className="mt-root" style={{ padding: 40, textAlign: 'center' }}>
        <style>{baseStyles}</style>
        <Loader2 className="animate-spin" style={{ margin: '0 auto', color: '#2563EB' }} />
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
        <Loader2 className="animate-spin" style={{ margin: '0 auto', color: '#2563EB' }} />
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
  // Con variantes, la alerta se evalúa por variante puntual (no alcanza con que el total
  // del producto esté bien si un color específico se quedó sin stock) — cada entrada del
  // listado sabe a qué producto/variante corresponde, para "Pedir más" y el detalle en Productos.
  const lowStock = stats.flatMap((p) => {
    if (hasVariants(p)) {
      return (p.variantStats || [])
        .filter((v) => v.stockDeposito > 0 && v.stockDeposito < (Number(v.lowStockThreshold) || Number(p.lowStockThreshold) || 20))
        .map((v) => ({ id: `${p.id}:${v.id}`, name: fullLabel(p, v), stockDeposito: v.stockDeposito, productId: p.id, variantId: v.id }));
    }
    if (p.stockDeposito > 0 && p.stockDeposito < (Number(p.lowStockThreshold) || 20)) {
      return [{ id: p.id, name: p.name, stockDeposito: p.stockDeposito, productId: p.id, variantId: null }];
    }
    return [];
  });

  // "Quién" combina a la gente del equipo con cuenta de Google (automático) con las
  // personas cargadas a mano (para casos sin cuenta, como ayuda puntual en un evento).
  const manualPeople = data.people || [];
  const teamPeople = teamProfiles.map((tp) => ({ id: tp.id, name: tp.full_name || tp.email || 'Sin nombre', email: tp.email, avatarUrl: tp.avatar_override || tp.avatar_url, hasAvatarOverride: !!tp.avatar_override, isTeamAccount: true }));
  const people = [...teamPeople, ...manualPeople];

  const addProduct = (product) => persist({ ...data, products: [...data.products, { ...product, id: uid() }] });
  const updateProduct = (id, updates) => persist({ ...data, products: data.products.map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  const removeProduct = async (id) => {
    if (!(await askConfirm('¿Eliminar este producto? También se van a borrar todos sus movimientos registrados.'))) return;
    persist({ ...data, products: data.products.filter((p) => p.id !== id), movements: data.movements.filter((m) => m.productId !== id) });
  };
  const addLocation = (loc) => persist({ ...data, locations: [...data.locations, { ...loc, id: uid() }] });
  const updateLocation = (id, updates) => persist({ ...data, locations: data.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)) });
  const removeLocation = async (id) => {
    if (!(await askConfirm('¿Eliminar este punto de venta/ubicación?'))) return;
    persist({ ...data, locations: data.locations.filter((l) => l.id !== id) });
  };
  const addPerson = (person) => persist({ ...data, people: [...(data.people || []), { ...person, id: uid() }] });
  const removePerson = async (id) => {
    if (!(await askConfirm('¿Eliminar esta persona del equipo?'))) return;
    persist({ ...data, people: (data.people || []).filter((u) => u.id !== id) });
  };
  const addProvider = (provider) => persist({ ...data, providers: [...(data.providers || []), { ...provider, id: uid() }] });
  const updateProvider = (id, updates) => persist({ ...data, providers: (data.providers || []).map((p) => (p.id === id ? { ...p, ...updates } : p)) });
  const removeProvider = async (id) => {
    if (!(await askConfirm('¿Eliminar este proveedor?'))) return;
    persist({ ...data, providers: (data.providers || []).filter((p) => p.id !== id) });
  };
  // Si mv ya trae un id (ej. "Venta rápida", que lo necesita al toque para poder deshacer) se respeta; si no, se genera uno.
  const addMovement = (mv) => persist({ ...data, movements: [{ id: uid(), ...mv }, ...data.movements] });
  const updateMovement = (id, updates) => persist({ ...data, movements: data.movements.map((m) => (m.id === id ? { ...m, ...updates } : m)) });
  const removeMovement = async (id) => {
    if (!(await askConfirm('¿Eliminar este movimiento? No se puede deshacer.'))) return;
    persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });
  };
  // Sin confirmación: para deshacer una venta recién cargada desde "Venta rápida" (mistap inmediato).
  const undoMovement = (id) => persist({ ...data, movements: data.movements.filter((m) => m.id !== id) });

  return (
    <div className="mt-root" style={{ minHeight: '100%' }}>
      <style>{baseStyles}</style>
      {confirmDialog}

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
        <span className="mt-mono" style={{ fontSize: 10.5, color: saving ? '#EB2563' : '#9CA3AF', padding: '0 8px 4px' }}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        <span className="mt-mono" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 14px', color: cloudOn ? '#2563EB' : '#9CA3AF' }}>
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
              background: tab === id ? '#EFF4FF' : 'transparent', color: tab === id ? '#2563EB' : '#6B7280',
              borderRadius: 8, cursor: 'pointer', fontWeight: tab === id ? 600 : 500, width: '100%', textAlign: 'left',
            }}
          >
            <Icon size={15} color={tab === id ? '#2563EB' : '#9CA3AF'} /> {label}
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
            <Movimientos data={data} people={people} typeMeta={TYPE_META} onAdd={addMovement} onUpdate={updateMovement} onRemove={removeMovement} onNavigate={setTab} />
          )}
          {tab === 'productos' && (
            <Productos products={data.products} stats={stats} providers={data.providers || []} onAdd={addProduct} onUpdate={updateProduct} onRemove={removeProduct} />
          )}
          {tab === 'ubicaciones' && (
            <Ubicaciones locations={data.locations} products={data.products} movements={data.movements} people={people} typeMeta={TYPE_META} onAdd={addLocation} onUpdate={updateLocation} onRemove={removeLocation} onAddMovement={addMovement} onUpdateMovement={updateMovement} onRemoveMovement={removeMovement} />
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
  .mt-input:focus { outline: 2px solid #2563EB; outline-offset: 1px; }

  .mt-select { position: relative; font-family: 'Poppins', sans-serif; }
  .mt-select-field { box-sizing: border-box; width: 100%; height: 38px; border: 1px solid #E1E3E8; background: #FFFFFF; border-radius: 9px; padding: 0 10px; font-size: 13px; color: #16181D; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
  .mt-select-field:hover { border-color: #C7CBD3; }
  .mt-select-field.open { border-color: #2563EB; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
  .mt-select-field:focus { outline: none; }
  .mt-select-field:focus-visible { outline: 2px solid #2563EB; outline-offset: 1px; }
  .mt-select-field.disabled { cursor: not-allowed; opacity: 0.55; }
  .mt-select-chev { color: #9CA3AF; flex-shrink: 0; transition: transform .2s ease; }
  .mt-select-field.open .mt-select-chev { transform: rotate(180deg); color: #2563EB; }
  .mt-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mt-select-value.placeholder { color: #9CA3AF; }
  .mt-select-panel { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #FFFFFF; border: 1px solid #EDEEF1; border-radius: 11px; box-shadow: 0 8px 24px rgba(16,20,24,0.12), 0 2px 6px rgba(16,20,24,0.06); padding: 5px; z-index: 30; max-height: 240px; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; }
  .mt-select-opt { font-size: 13px; padding: 9px 10px; border-radius: 7px; cursor: pointer; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .mt-select-opt:hover, .mt-select-opt.highlighted { background: #F7F7F8; }
  .mt-select-opt.selected { background: #EFF4FF; color: #1D4ED8; font-weight: 600; }
  .mt-select-opt.selected.highlighted { background: #DCE9FE; }
  .mt-select-opt-label { min-width: 0; white-space: normal; word-break: break-word; line-height: 1.35; }
  .mt-select-opt .mt-select-check { color: #2563EB; opacity: 0; width: 13px; height: 13px; flex-shrink: 0; margin-top: 1px; }
  .mt-select-opt.selected .mt-select-check { opacity: 1; }
  .mt-btn { position: relative; box-sizing: border-box; height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #2563EB; color: #FFFFFF; border: none; border-radius: 9px; padding: 0 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif; box-shadow: 0 1px 2px rgba(16,20,24,0.08); transition: background .15s ease, box-shadow .15s ease, transform .1s ease; white-space: nowrap; flex-shrink: 0; }
  .mt-btn:hover { background: #1D4ED8; box-shadow: 0 4px 12px rgba(37,99,235,0.28); transform: translateY(-1px); }
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

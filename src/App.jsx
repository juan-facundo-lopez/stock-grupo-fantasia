import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, LogIn, ShieldAlert, LogOut, Menu, X, Wifi, WifiOff, User, LayoutGrid, Zap, ListPlus, Package, Store, Users, Truck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { Dashboard } from './components/Dashboard';
import { Productos } from './components/Productos';
import { Movimientos } from './components/Movimientos';
import { VentaRapida } from './components/VentaRapida';
import { Ubicaciones } from './components/Ubicaciones';
import { Personas } from './components/Personas';
import { Proveedores } from './components/Proveedores';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { useConfirmDialog } from './components/shared';
import { uid, computeStats, hasVariants, fullLabel } from './lib/helpers';

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
      <div className="font-sans bg-[#EDEEF1] text-foreground min-h-full flex items-center justify-center p-10 text-center">
        <div>
          <Loader2 className="animate-spin mx-auto text-primary" />
          <p className="mt-2.5 text-[13px] text-muted-foreground">Verificando sesión…</p>
        </div>
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
      <div className="font-sans bg-[#EDEEF1] text-foreground min-h-full flex items-center justify-center p-10 text-center">
        <div>
          <Loader2 className="animate-spin mx-auto text-primary" />
          <p className="mt-2.5 text-[13px] text-muted-foreground">Cargando stock…</p>
        </div>
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
    <div className="font-sans bg-[#EDEEF1] text-foreground min-h-full">
      {confirmDialog}

      {!mobileNavOpen && (
        <button
          onClick={() => setMobileNavOpen(true)}
          className="hidden max-[880px]:flex fixed top-4 left-4 z-[55] w-10 h-10 rounded-[10px] bg-card border border-border shadow-sm items-center justify-center cursor-pointer text-foreground"
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>
      )}
      {mobileNavOpen && (
        <div className="hidden max-[880px]:block fixed inset-0 bg-black/35 z-40" onClick={() => setMobileNavOpen(false)} />
      )}

      <nav
        className={`fixed top-4 left-4 bottom-4 w-52 bg-card border border-border rounded-2xl shadow-card p-3 flex flex-col gap-0.5 overflow-y-auto z-50 max-[880px]:w-[min(82vw,260px)] max-[880px]:shadow-pop max-[880px]:transition-transform max-[880px]:duration-[250ms] max-[880px]:ease-out ${mobileNavOpen ? 'max-[880px]:translate-x-0' : 'max-[880px]:-translate-x-[120%]'}`}
      >
        <div className="flex items-center gap-2 px-2 pt-1.5 pb-4">
          <div className="w-[26px] h-[26px] rounded-[7px] bg-[#16181D] text-white flex items-center justify-center text-[13px] font-extrabold shrink-0">M</div>
          <h1 className="font-heading text-[13.5px] font-bold m-0 tracking-tight leading-tight">Merch Tracker</h1>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="hidden max-[880px]:flex ml-auto items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>
        <span className={`text-[10.5px] px-2 pb-1 ${saving ? 'text-warning' : 'text-muted-foreground'}`}>{saving ? 'guardando…' : 'guardado ✓'}</span>
        <span className={`text-[10px] flex items-center gap-1 px-2 pb-3.5 ${cloudOn ? 'text-primary' : 'text-muted-foreground'}`}>
          {cloudOn ? <Wifi size={11} /> : <WifiOff size={11} />} {cloudOn ? 'compartido (Supabase)' : 'solo local'}
        </span>
        <span className="text-[10px] tracking-[1.5px] text-muted-foreground uppercase font-semibold px-2.5 pb-1.5">Menú</span>
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
            className={`flex items-center gap-2 px-2.5 py-2 text-[13px] border-none rounded-lg cursor-pointer w-full text-left ${tab === id ? 'bg-primary-tint text-primary font-semibold' : 'bg-transparent text-muted-foreground font-medium hover:text-foreground'}`}
          >
            <Icon size={15} className={tab === id ? 'text-primary' : 'text-muted-foreground'} /> {label}
            {!!badge && (
              <span className="ml-auto bg-destructive-bg text-destructive rounded-full text-[10.5px] px-1.5 py-px font-bold">{badge}</span>
            )}
          </button>
        ))}
        {cloudOn && (
          <div className="mt-auto">
            <div className="bg-[#EDEEF1] h-px my-2.5 mx-2" />
            <button
              onClick={signOut}
              title={userEmail}
              className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] border-none bg-transparent text-muted-foreground rounded-lg cursor-pointer font-medium w-full text-left"
            >
              {(ownAvatarOverride || userAvatar) ? (
                <img src={ownAvatarOverride || userAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <User size={14} className="shrink-0" />
              )}
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{userName}</span>
              <LogOut size={13} className="shrink-0" />
            </button>
          </div>
        )}
      </nav>

      <div className="ml-60 pt-4 max-[880px]:ml-0 max-[880px]:pt-16">
        <main className="px-5 pb-10 max-[880px]:px-3.5 max-[880px]:pb-8">
          {toast && (
            <div className="bg-destructive-bg border border-destructive-border text-destructive px-3.5 py-2.5 rounded-xl text-[12.5px] mb-4">
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
    <div className="font-sans bg-[#EDEEF1] text-foreground min-h-full flex items-center justify-center p-6">
      <Card className="p-9 max-w-[340px] w-full text-center">
        <div className="w-10 h-10 rounded-[11px] bg-[#16181D] text-white flex items-center justify-center text-lg font-extrabold mx-auto mb-4">M</div>
        <h1 className="font-heading text-[17px] font-bold m-0 mb-1.5">Merch Tracker</h1>
        <p className="text-[12.5px] text-muted-foreground m-0 mb-6 leading-relaxed">
          Iniciá sesión con tu cuenta de Google para acceder al stock de Grupo Fantasía.
        </p>
        <Button onClick={onSignIn} className="w-full">
          <LogIn size={15} /> Continuar con Google
        </Button>
        {error && <p className="text-[11.5px] text-destructive mt-3.5">{error}</p>}
      </Card>
    </div>
  );
}

function NotAuthorizedScreen({ email, onSignOut }) {
  return (
    <div className="font-sans bg-[#EDEEF1] text-foreground min-h-full flex items-center justify-center p-6">
      <Card className="p-9 max-w-[360px] w-full text-center">
        <ShieldAlert size={30} className="text-destructive mx-auto mb-3.5" />
        <h1 className="font-heading text-base font-bold m-0 mb-2">Sin acceso</h1>
        <p className="text-[12.5px] text-muted-foreground m-0 mb-5 leading-relaxed">
          La cuenta <strong className="text-foreground">{email}</strong> no tiene permiso para entrar acá. Pedile a un administrador que te agregue.
        </p>
        <Button variant="outline" onClick={onSignOut} className="w-full">
          <LogOut size={15} /> Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}

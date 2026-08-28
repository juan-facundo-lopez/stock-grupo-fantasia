import { useState, useEffect, useLayoutEffect, useCallback, useRef, useId } from 'react';
import { X, Check, ChevronDown, ImageOff, Upload, Loader2, AlertTriangle, MapPin, MessageCircle } from 'lucide-react';
import { uid, uploadToStorage, uploadErrorMessage, mapsUrl, waUrl } from '../lib/helpers';
import { Card } from './ui/card';
import { Button } from './ui/button';

// --- Componentes compartidos por TODA la app (ya migrada por completo a shadcn/ui). ---
// Estos son los pocos widgets con logica/UX propia (dropdown animado, subida de imagen,
// modal de confirmacion) que se usan desde mas de una pantalla -- viven ac fuera para no
// duplicarlos. Todos en Tailwind, mismos tokens de color/radio/sombra que el resto.

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ListToolbar({ query, onQueryChange, sortValue, onSortChange, sortOptions, placeholder = 'Buscar por nombre…', resultCount }) {
  return (
    <div className="flex gap-2.5 flex-wrap items-end mb-3.5">
      <Field label="Buscar">
        <input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 220 }} placeholder={placeholder} value={query} onChange={(e) => onQueryChange(e.target.value)} />
      </Field>
      <Field label="Ordenar por">
        <Select value={sortValue} onChange={onSortChange} options={sortOptions} style={{ width: 190 }} />
      </Field>
      {typeof resultCount === 'number' && (
        <span className="text-muted-foreground text-[11.5px] pb-2">{resultCount} resultado{resultCount === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}

// Dropdown propio (reemplaza <select> nativo) para tener el mismo look que el resto de
// los inputs y poder animar la apertura -- el listbox nativo del navegador no se puede
// estilizar. options: [{ value, label }]. Mantiene la misma API value/onChange que un
// select controlado para que el resto del codigo no cambie.
export function Select({ value, onChange, options, placeholder = 'Seleccionar…', style, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
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
    <div className="relative" ref={rootRef} style={style}>
      <div
        className={`box-border w-full h-9 rounded-md border px-3 text-sm flex items-center justify-between gap-2 cursor-pointer select-none ${open ? 'border-primary ring-2 ring-[rgba(37,99,235,0.15)]' : 'border-input hover:border-[#C7CBD3]'} ${disabled ? 'cursor-not-allowed opacity-55' : ''}`}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`overflow-hidden text-ellipsis whitespace-nowrap ${!selected ? 'text-muted-foreground' : ''}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180 text-primary' : 'text-muted-foreground'}`} />
      </div>
      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-card border border-border rounded-[11px] shadow-pop p-[5px] z-30 max-h-60 overflow-y-auto overflow-x-hidden box-border" ref={panelRef} id={listId} role="listbox">
          {options.map((opt, i) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`text-sm px-2.5 py-2 rounded-[7px] cursor-pointer flex items-start justify-between gap-2 ${isSelected ? 'bg-primary-tint text-primary font-semibold' : i === highlight ? 'bg-muted' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                <span className="min-w-0 whitespace-normal break-words leading-snug">{opt.label}</span>
                <Check size={13} className={`text-primary shrink-0 mt-px ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ImageUploadField({ value, onChange, label = 'Mockup / imagen', accept = 'image/*,application/pdf' }) {
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
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        {value ? (
          <div className="relative">
            <img src={value} alt="" className="w-[34px] h-[34px] object-cover rounded-md border border-border" />
            <button type="button" onClick={() => onChange('')} className="absolute -top-2 -right-2 bg-card border border-border rounded-full p-0.5 inline-flex items-center justify-center text-muted-foreground hover:text-destructive">
              <X size={10} />
            </button>
          </div>
        ) : (
          <ImageOff size={18} className="text-muted-foreground" />
        )}
        <label htmlFor={inputId} className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold h-10 px-4 bg-primary text-primary-foreground shadow-card hover:brightness-95 cursor-pointer">
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Subiendo…' : value ? 'Cambiar' : 'Subir imagen'}
        </label>
        <input id={inputId} type="file" accept={accept} onChange={handleFile} className="hidden" disabled={uploading} />
      </div>
      {error && <span className="text-[10px] text-destructive max-w-[160px]">{error}</span>}
    </Field>
  );
}

// Modal de confirmacion generico (ej. "esto va a dejar stock negativo, confirmas?").
// Lo usan tanto el shell principal (MerchTracker) como pantallas sueltas (Movimientos,
// Ubicaciones) que necesitan su propia confirmacion puntual.
export function useConfirmDialog() {
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
      className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4"
    >
      <Card onClick={(e) => e.stopPropagation()} className="max-w-[380px] w-full p-[18px]">
        <div className="flex gap-2.5 items-start mb-[18px]">
          <AlertTriangle size={18} className="text-destructive shrink-0 mt-px" />
          <p className="text-sm leading-relaxed m-0">{pending.message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => answer(false)}>
            Cancelar
          </Button>
          <Button type="button" className="bg-[#D8493F] text-white hover:bg-[#B23A31]" onClick={() => answer(true)}>
            Confirmar igual
          </Button>
        </div>
      </Card>
    </div>
  ) : null;

  return { confirm, dialog };
}

// Movidos tal cual desde App.jsx. Los usan Ubicaciones.jsx y Proveedores.jsx.
export function MapsLink({ address }) {
  if (!address) return null;
  return (
    <a href={mapsUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-primary no-underline font-semibold">
      <MapPin size={12} /> Ver en Maps
    </a>
  );
}

// Link directo a un chat de WhatsApp con el telefono cargado, usando el codigo de pais elegido.
export function WhatsAppLink({ phone, phoneCountry }) {
  const url = waUrl(phone, phoneCountry);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] no-underline font-semibold" style={{ color: '#25A25A' }}>
      <MessageCircle size={12} /> WhatsApp
    </a>
  );
}

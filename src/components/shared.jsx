import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react';
import { X, Check, ChevronDown, ImageOff, Upload, Loader2 } from 'lucide-react';
import { uid, uploadToStorage, uploadErrorMessage } from '../lib/helpers';

// --- Componentes compartidos por TODA la app (migrada y sin migrar todavia). ---
// Movidos tal cual desde App.jsx (misma logica, mismas clases .mt-* / baseStyles de
// siempre) para que Dashboard.jsx y Productos.jsx los puedan importar sin duplicarlos.
// Las pantallas ya migradas a shadcn (Dashboard, Productos) NO usan este Card/Field/
// Select -- tienen su propia version con Tailwind. Este es el que siguen usando
// Movimientos, Ubicaciones, Personas, Proveedores, Venta rapida, etc. hasta que
// tambien se migren.

export function Card({ children, style, className = '', onClick }) {
  return (
    <div className={`tag-card ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function useConfirmMorph() {
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

export function ConfirmContent({ children }) {
  return (
    <>
      <span className="btn-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{children}</span>
      <span className="btn-check" style={{ position: 'absolute', inset: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0 }}>
        <Check size={14} /> Listo
      </span>
    </>
  );
}

export function SectionTitle({ children }) {
  return <div className="mt-display" style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.1px', margin: '4px 0 12px', color: '#16181D' }}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="mt-mono" style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: '#6B7280' }}>{label}</span>
      {children}
    </label>
  );
}

export function ListToolbar({ query, onQueryChange, sortValue, onSortChange, sortOptions, placeholder = 'Buscar por nombre…', resultCount }) {
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

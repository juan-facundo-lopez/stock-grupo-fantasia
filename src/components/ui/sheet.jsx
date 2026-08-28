import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

// Panel lateral (drawer) generico. Mismo patron de overlay que useConfirmDialog en
// shared.jsx (backdrop oscuro, click afuera para cerrar, Escape) pero deslizando desde
// la derecha y con su propio scroll interno -- pensado para formularios largos (ej.
// editar un producto con variantes) que no entran comodos en un modal chico centrado.
// Header y footer quedan fijos (sticky); solo el contenido del medio scrollea, asi los
// botones de Guardar/Cancelar siempre estan a la vista sin importar cuanto se bajo.
// z-[150]: por debajo del modal de confirmacion (z-[200] en shared.jsx), por si alguna
// vez conviven en pantalla.
export function Sheet({ open, onClose, title, footer, widthClassName = 'max-w-[520px]', children }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Doble rAF a proposito: con uno solo, React a veces pinta el estado inicial
      // (translate-x-full) y el "visible" en el mismo frame -- la transicion no tiene
      // de donde partir y el panel aparece de golpe en vez de deslizarse. Con dos
      // frames, se garantiza un pintado en la posicion de afuera antes de animar hacia
      // adentro.
      let raf2;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKeydown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeydown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeydown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[150] flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`relative h-full w-full ${widthClassName} bg-card shadow-pop flex flex-col transition-transform duration-200 ease-out max-[640px]:max-w-full ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-heading text-base font-bold m-0 truncate">{title}</h2>
          <Button type="button" variant="icon" size="icon" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex gap-2 justify-end px-5 py-4 border-t border-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

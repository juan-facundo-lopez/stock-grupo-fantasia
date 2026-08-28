import { useState, useRef } from 'react';
import { Plus, Pencil, X, User, Loader2, Undo2 } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { uid, uploadToStorage, uploadErrorMessage } from '../lib/helpers';

// Personas migrado a shadcn/ui (preset b2vP1JgrVi). Misma logica/props/handlers que la
// version anterior en App.jsx -- solo cambia el markup/estilos. TeamMemberCard vive en
// este mismo archivo (solo lo usa Personas).

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

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
    } catch (err) {
      setError(uploadErrorMessage(err));
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
    <Card className="px-4 py-3 flex items-center gap-2.5 flex-wrap max-[640px]:w-full">
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" className="w-[26px] h-[26px] rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none'; }} referrerPolicy="no-referrer" />
      ) : (
        <User size={15} className="text-primary shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{person.name}</div>
        {person.email && <div className="text-muted-foreground text-[10.5px] truncate">{person.email}</div>}
      </div>
      {/* Bloque pegado a la derecha (movimientos + lapiz + deshacer): pinneado con
          ml-auto para que quede a la misma altura y alineado en todas las cards, sin
          importar si el nombre/email de esta persona en particular es mas corto o
          mas largo que el de las demas. */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <span className="text-muted-foreground text-[11px] whitespace-nowrap">{count} movimiento{count === 1 ? '' : 's'}</span>
        {isOwn && (
          <>
            <label htmlFor={inputId} title="Cambiar mi foto" className={`inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
            </label>
            <input id={inputId} type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={uploading} />
            {person.hasAvatarOverride && (
              <Button type="button" variant="icon" size="icon" onClick={revert} title="Volver a la foto de Google" disabled={uploading}>
                <Undo2 size={13} />
              </Button>
            )}
          </>
        )}
      </div>
      {error && <div className="w-full text-[10px] text-destructive">{error}</div>}
    </Card>
  );
}

export function Personas({ teamPeople, manualPeople, movements, onAdd, onRemove, currentUserId, onUpdateAvatar }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim() });
    setName('');
  };
  return (
    <div className="font-sans">
      <div className="mb-[18px]">
        <h1 className="font-heading text-xl font-bold m-0 mb-0.5">Personas</h1>
        <p className="m-0 text-[12.5px] text-muted-foreground">Equipo con cuenta de Google y gente cargada a mano.</p>
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Equipo</div>
      <p className="text-muted-foreground text-xs mb-3">
        Se cargan solas cuando alguien del equipo inicia sesión con Google — no hace falta agregarlas a mano.
        Cada quien puede tocar el lápiz de su propia tarjeta para poner otra foto.
      </p>
      <div className="flex flex-wrap gap-3 mb-6">
        {teamPeople.length === 0 && <p className="text-muted-foreground text-[13px]">Todavía nadie del equipo inició sesión.</p>}
        {teamPeople.map((u) => {
          const count = movements.filter((m) => m.personId === u.id).length;
          return (
            <TeamMemberCard key={u.id} person={u} count={count} isOwn={u.id === currentUserId} onUpdateAvatar={onUpdateAvatar} />
          );
        })}
      </div>

      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Agregadas a mano</div>
      <p className="text-muted-foreground text-xs mb-3">
        Para gente sin cuenta de Google (ej. ayuda puntual en un evento).
      </p>
      <Card className="p-4 mb-5 max-w-[440px]">
        <form onSubmit={submit} className="flex gap-2.5 flex-wrap items-end">
          <Field label="Nombre"><input className="h-9 rounded-md border border-input px-3 text-sm" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Rocío" required /></Field>
          <Button type="submit"><Plus size={14} /> Agregar persona</Button>
        </form>
      </Card>
      <div className="flex flex-wrap gap-3">
        {manualPeople.length === 0 && <p className="text-muted-foreground text-[13px]">Todavía no hay personas cargadas a mano.</p>}
        {manualPeople.map((u) => {
          const count = movements.filter((m) => m.personId === u.id).length;
          return (
            <Card key={u.id} className="px-4 py-3 flex items-center gap-2.5 max-[640px]:w-full">
              <User size={15} className="text-primary shrink-0" />
              <span className="font-semibold truncate min-w-0 flex-1">{u.name}</span>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <span className="text-muted-foreground text-[11px] whitespace-nowrap">{count} movimiento{count === 1 ? '' : 's'}</span>
                <Button variant="icon" size="icon" onClick={() => onRemove(u.id)}><X size={13} /></Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

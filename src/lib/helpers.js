import { supabase } from '../supabaseClient';

// --- Helpers puros, compartidos por TODA la app (migrada y sin migrar todavia). ---
// Movidos tal cual desde App.jsx, sin cambiar una linea de logica -- solo cambia
// donde viven, para que Dashboard.jsx y Productos.jsx los puedan importar sin
// duplicarlos ni crear un import circular con App.jsx.

export const euro = (n) => `€${(Number(n) || 0).toFixed(2)}`;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function waUrl(phone, phoneCountry) {
  if (!phone) return null;
  const trimmed = phone.trim();
  const full = trimmed.startsWith('+') ? trimmed : `${phoneCountry || ''}${trimmed.replace(/^0+/, '')}`;
  const digits = full.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function buildOrderMailto(product, provider, qty, lowVariants) {
  const subject = `Pedido de reposición: ${product.name}`;
  const lines = [
    `Hola${provider?.name ? ' ' + provider.name : ''},`,
    '',
    `Necesitamos reponer stock de "${product.name}".`,
    `Cantidad solicitada: ${qty} unidades`,
  ];
  if (lowVariants && lowVariants.length > 0) {
    lines.push('', 'Variantes con stock bajo puntual:', ...lowVariants.map((v) => `- ${v.label}: quedan ${v.stockDeposito}`));
  }
  if (product.unitsPerPackage) lines.push(`Unidades por paquete: ${product.unitsPerPackage}`);
  if (product.weight) lines.push(`Peso / medida: ${product.weight}`);
  if (product.mockupUrl) lines.push('', `Mockup / referencia: ${product.mockupUrl}`);
  lines.push('', 'Gracias!');
  const body = lines.join('\n');
  return `mailto:${provider?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function hasVariants(product) {
  return (product?.attributes || []).length > 0;
}

export function variantLabel(product, variant) {
  const attrs = product?.attributes || [];
  if (!variant || attrs.length === 0) return '';
  return attrs.map((a) => variant.attributeValues?.[a.name]).filter(Boolean).join(' / ');
}

export function fullLabel(product, variant) {
  if (!product) return '—';
  const vl = variantLabel(product, variant);
  return vl ? `${product.name} — ${vl}` : product.name;
}

export function sameAttributeValues(a, b, attrNames) {
  return attrNames.every((n) => a[n] === b[n]);
}

export function attributeCombos(attributes) {
  return (attributes || []).reduce(
    (acc, attr) => acc.flatMap((combo) => (attr.options || []).map((opt) => ({ ...combo, [attr.name]: opt }))),
    [{}]
  );
}

export function generateVariants(product) {
  const attrs = product.attributes || [];
  if (attrs.length === 0) return [];
  const attrNames = attrs.map((a) => a.name);
  const existing = product.variants || [];
  return attributeCombos(attrs).map((combo) => {
    const found = existing.find((v) => sameAttributeValues(v.attributeValues || {}, combo, attrNames));
    return found || { id: uid(), attributeValues: combo, initialStock: 0, lowStockThreshold: '', priceOverride: '' };
  });
}

export function getVariantStock(product, variant, movements) {
  const vm = movements.filter((m) => m.productId === product.id && m.variantId === variant.id);
  const ingreso = vm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const salida = vm.filter((m) => ['venta', 'fallada', 'regalada'].includes(m.type)).reduce((s, m) => s + Number(m.quantity), 0);
  return Number(variant.initialStock) + ingreso - salida;
}

export function getVariantStockDeposito(product, variant, movements) {
  const vm = movements.filter((m) => m.productId === product.id && m.variantId === variant.id);
  const ingreso = vm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const entrega = vm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
  return Number(variant.initialStock) + ingreso - entrega;
}

export function getProductStock(product, movements) {
  const pm = movements.filter((m) => m.productId === product.id);
  const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const salida = pm.filter((m) => ['venta', 'fallada', 'regalada'].includes(m.type)).reduce((s, m) => s + Number(m.quantity), 0);
  return Number(product.initialStock) + ingreso - salida;
}

export function getProductStockDeposito(product, movements) {
  const pm = movements.filter((m) => m.productId === product.id);
  const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
  const entrega = pm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
  return Number(product.initialStock) + ingreso - entrega;
}

export function computeStats(products, movements) {
  return products.map((p) => {
    if (hasVariants(p)) {
      const variantStats = (p.variants || []).map((v) => {
        const vm = movements.filter((m) => m.productId === p.id && m.variantId === v.id);
        const vendido = vm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
        const recaudado = vm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
        const fallada = vm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
        const regalada = vm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
        const ingreso = vm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
        const entrega = vm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
        const stockActual = Number(v.initialStock) + ingreso - vendido - fallada - regalada;
        const stockDeposito = Number(v.initialStock) + ingreso - entrega;
        return { ...v, label: variantLabel(p, v), vendido, recaudado, fallada, regalada, stockActual, stockDeposito };
      });
      const sum = (key) => variantStats.reduce((s, v) => s + v[key], 0);
      return {
        ...p,
        variantStats,
        vendido: sum('vendido'), recaudado: sum('recaudado'), fallada: sum('fallada'), regalada: sum('regalada'),
        stockActual: sum('stockActual'), stockDeposito: sum('stockDeposito'),
      };
    }
    const pm = movements.filter((m) => m.productId === p.id);
    const vendido = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.quantity), 0);
    const recaudado = pm.filter((m) => m.type === 'venta').reduce((s, m) => s + Number(m.amount), 0);
    const fallada = pm.filter((m) => m.type === 'fallada').reduce((s, m) => s + Number(m.quantity), 0);
    const regalada = pm.filter((m) => m.type === 'regalada').reduce((s, m) => s + Number(m.quantity), 0);
    const ingreso = pm.filter((m) => m.type === 'ingreso').reduce((s, m) => s + Number(m.quantity), 0);
    const entrega = pm.filter((m) => m.type === 'entrega').reduce((s, m) => s + Number(m.quantity), 0);
    const stockActual = Number(p.initialStock) + ingreso - vendido - fallada - regalada;
    const stockDeposito = Number(p.initialStock) + ingreso - entrega;
    return { ...p, variantStats: null, vendido, recaudado, fallada, regalada, stockActual, stockDeposito };
  });
}

// Sube un archivo al bucket de Supabase Storage indicado y devuelve su URL pública.
// Compartido por ImageUploadField (mockups de producto, logos) y por el selector de
// foto de perfil en Personas.
export async function uploadToStorage(file, bucket = 'mockups') {
  if (!supabase) throw new Error('Subida de imágenes requiere Supabase conectado.');
  const path = `${Date.now()}-${uid()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  return pub.publicUrl;
}

export function uploadErrorMessage(err) {
  const raw = err?.message || err?.error_description || '';
  const low = raw.toLowerCase();
  if (low.includes('exceeded') || low.includes('too large') || low.includes('payload')) {
    return `La imagen es demasiado pesada para el límite configurado en el bucket "mockups" (Supabase → Storage → mockups → Configuración). Probá con una foto más liviana o subí el límite ahí. (${raw})`;
  }
  if (low.includes('mime type') || low.includes('not supported') || low.includes('not allowed')) {
    return `El formato de este archivo no está permitido en el bucket "mockups" — las fotos que sacan algunos celulares (ej. HEIC de iPhone) no son jpg/png. Probá exportarla como JPG o sumar ese formato en Supabase → Storage → mockups → Configuración → tipos MIME permitidos. (${raw})`;
  }
  if (low.includes('row-level security') || low.includes('permission') || low.includes('not authorized') || low.includes('403')) {
    return `Supabase rechazó la subida por permisos (política de la tabla/bucket). Revisá las políticas de Storage para "mockups". (${raw})`;
  }
  if (!raw) return 'No se pudo subir la imagen (no llegó un motivo desde Supabase). Probá de nuevo o con otra foto.';
  return `No se pudo subir la imagen: ${raw}`;
}

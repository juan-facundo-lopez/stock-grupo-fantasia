// Service worker "vacio" a proposito: no cachea absolutamente nada. Existe solo para
// que el navegador considere la pagina instalable como PWA -- no tiene listener de
// 'fetch', asi que nunca intercepta ni guarda una respuesta. Cada carga (incluso ya
// instalada en la pantalla de inicio) pide siempre la version mas nueva al servidor,
// exactamente igual que abrir el sitio en el navegador. Ver el punto 11 de
// mejoras-stock-fantasia.md para el motivo (la app depende de datos en vivo via
// Supabase, no tiene sentido cachear el HTML/JS y arriesgarse a que quede vieja).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

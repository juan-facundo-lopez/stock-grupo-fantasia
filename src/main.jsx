import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registra el service worker "vacio" de public/sw.js (no cachea nada, ver el archivo
// y el punto 11 de mejoras-stock-fantasia.md) -- solo para que el navegador ofrezca
// instalar la app en pantalla de inicio.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Si falla el registro (por ejemplo en localhost sin https), la app sigue
      // funcionando igual -- el service worker es solo para el "instalar", no hace
      // falta para nada mas.
    });
  });
}

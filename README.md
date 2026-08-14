# Stock Grupo Fantasía

Tracker de merch (stock, ventas, restaurantes) para reemplazar los Excels sueltos.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abrí el link que te tira la terminal (normalmente `http://localhost:5173`).

## Estructura de datos

Todo vive en `src/App.jsx`, en tres entidades:

- **products** — nombre, categoría, precio, invertido, stock inicial
- **locations** — restaurantes + oficina
- **movements** — cada venta / fallada / regalada / ingreso, con producto, ubicación, cantidad, monto y fecha

El stock actual y los totales del dashboard se recalculan solos a partir de `movements`.

## ⚠️ Importante: esto guarda los datos SOLO en tu navegador

Ahora mismo usa `localStorage`, o sea que los datos quedan guardados en el navegador de la compu donde lo abriste — si tu amigo lo abre en la suya, ve la app vacía (con los datos de ejemplo).

Para que **varias personas carguen datos y todos vean lo mismo**, el próximo paso es conectar un backend real. Las opciones más simples:

- **Supabase** (gratis para este volumen, Postgres + API lista en minutos)
- **Firebase** (similar, de Google)

Avisale a Claude cuando quieran dar ese paso y armamos la conexión.

## Subir a GitHub

```bash
git init
git add .
git commit -m "primera version del tracker"
git branch -M main
git remote add origin <URL_DE_TU_REPO>
git push -u origin main
```

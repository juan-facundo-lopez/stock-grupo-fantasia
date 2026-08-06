# 📦 Stock Grupo Fantasía

> Sistema interno de inventario multiubicación para administrar merchandising y material promocional de un grupo de restaurantes.

![Estado](https://img.shields.io/badge/estado-dise%C3%B1o%20validable-6D63E8)
![Etapa](https://img.shields.io/badge/etapa-pre--desarrollo-111318)
![Producto](https://img.shields.io/badge/producto-MVP-159A91)

---

## ⚡ Nivel 1 — Entenderlo en 30 segundos

### 🤔 ¿Qué problema resuelve?

El stock de la oficina central y los restaurantes se administra actualmente mediante archivos de Excel. Esto dificulta conocer con certeza:

- Cuánto stock queda.
- Dónde está cada producto.
- Qué entró y qué salió.
- Qué productos están siendo trasladados.
- Cuándo es necesario volver a fabricar.

### 💡 ¿Qué propone el producto?

Una aplicación web interna, rápida y simple que centraliza el inventario de todas las ubicaciones y conserva un historial auditable de cada movimiento.

### 🚧 Estado actual

El proyecto está en **fase de diseño y definición del MVP**.

Actualmente existen:

- Definición completa del producto.
- Design System.
- Especificación de pantallas.
- Análisis de referencias visuales.
- Prototipo HTML navegable.

> [!IMPORTANT]
> Todavía no existe una aplicación de producción, backend, base de datos ni autenticación real. `prototype.html` es una demostración interactiva de la experiencia propuesta.

### 👉 Accesos rápidos

- [Abrir el prototipo](./prototype.html)
- [Leer la definición del producto](./product-definition.md)
- [Consultar el Design System](./design-system.md)
- [Ver todas las pantallas](./screen-specification.md)

---

## 🧭 Nivel 2 — Conocer el producto en 5 minutos

### 🎯 Objetivo

Reemplazar los Excel operativos por una fuente única de stock que permita trabajar a múltiples administradores sin perder trazabilidad.

El producto debe responder en cualquier momento:

1. **Qué tenemos.**
2. **Cuánto queda.**
3. **Dónde está.**
4. **Cómo llegó hasta ahí.**
5. **Qué necesita reposición.**

### 📍 Ubicaciones iniciales

- Oficina central.
- Restaurante 1.
- Restaurante 2.
- Restaurante 3.
- Restaurante 4.

Las ubicaciones serán configurables. No estarán programadas como una lista fija, permitiendo incorporar nuevos restaurantes o almacenes.

### 🧸 Productos administrados

Pines, pegatinas, tarjetas regalo, tarjetas de descuento, tarjetas de visita, vasos, bolsas, peluches y cualquier otro material promocional del grupo.

### ✨ Funcionalidades del MVP

- 🔐 Acceso por invitación para administradores.
- 📊 Dashboard operativo.
- 📦 Inventario por producto y ubicación.
- 🏷️ Catálogo de productos.
- ↕️ Entradas, salidas y ajustes.
- 🚚 Transferencias con stock en tránsito.
- 📋 Recuentos de inventario físico.
- 📄 Importación manual de ventas mediante CSV o Excel.
- ⚠️ Alertas de stock bajo.
- 🕘 Historial auditable.
- 👥 Administración de usuarios y ubicaciones.

### 🧠 Principio central

El stock **no se edita directamente**. Se calcula a partir de operaciones registradas:

```text
Stock físico = saldo inicial
               + entradas
               + recepciones
               + devoluciones
               - salidas
               - ventas
               - transferencias enviadas
               ± ajustes
```

Esto permite explicar cada diferencia y conocer quién realizó cada cambio.

### 🔄 Flujo principal

```mermaid
flowchart LR
    A["Login"] --> B["Resumen"]
    B --> C["Inventario"]
    C --> D["Producto"]
    D --> E["Nueva operación"]
    E --> F["Revisar impacto"]
    F --> G["Confirmar"]
    G --> H["Stock actualizado"]
    H --> I["Historial"]
```

### 🚚 Transferencias

Los productos no aparecen instantáneamente en el restaurante de destino:

```mermaid
flowchart LR
    A["Oficina central"] --> B["Despacho"]
    B --> C["En tránsito"]
    C --> D["Recepción"]
    D --> E["Stock del restaurante"]
```

Una recepción parcial conserva las unidades restantes en tránsito.

### 🎨 Dirección visual

La interfaz busca una estética SaaS moderna inspirada en productos como Linear, Vercel, Notion, Stripe Dashboard, Framer y Raycast.

Principios visuales:

- Tipografía Poppins.
- Escala tipográfica compacta y refinada.
- Canvas blanco puro.
- Cards pastel sin stroke.
- Superficies blancas con outline gris muy sutil.
- Cero sombras.
- Navegación seleccionada mediante iconos violetas `#6D63E8`.
- Footer mobile fijo.
- Grid base de 8 px.
- Iconografía Lucide.

---

## 🔬 Nivel 3 — Profundizar en producto y arquitectura

### 🧱 Entidades principales

| Entidad | Responsabilidad |
| --- | --- |
| Organización | Aísla usuarios y datos de cada empresa |
| Administrador | Persona con acceso operativo |
| Ubicación | Oficina, restaurante, almacén o lugar temporal |
| Producto | Artículo administrado por SKU |
| Regla de stock | Mínimo, objetivo y tiempo de fabricación |
| Operación | Entrada, salida, transferencia, venta o ajuste |
| Línea de operación | Producto y cantidad involucrada |
| Importación | Lote proveniente del software de ventas |
| Alerta | Condición que necesita una decisión |
| Evento de auditoría | Cambio administrativo o sensible |

### 🛡️ Reglas que protegen la integridad del stock

- Los movimientos confirmados son inmutables.
- Los errores se corrigen mediante una reversión o un ajuste.
- El stock negativo está bloqueado por defecto.
- Cada operación registra usuario, fecha efectiva y fecha de creación.
- Los productos con historial se desactivan; no se eliminan.
- Las ubicaciones con saldo no pueden desactivarse.
- Las importaciones duplicadas deben ser detectadas.
- Las operaciones con varios productos deben confirmarse de forma atómica.

### 📅 Limitación conocida: ventas mensuales

El software externo de ventas no posee API. Por eso el reporte se cargará manualmente.

Si se importa una vez por mes, el sistema no puede conocer el consumo ocurrido después del último archivo. La interfaz debe mostrar siempre:

> Ventas actualizadas hasta el 31/07/2026.

La arquitectura aceptará archivos semanales o diarios en el futuro sin necesidad de reconstruir el inventario.

### 👤 Roles iniciales

#### Propietario

- Acceso operativo completo.
- Administración de usuarios.
- Configuración de la organización.
- Reversión de importaciones.
- Exportación completa.

#### Administrador

- Catálogo.
- Inventario.
- Movimientos.
- Transferencias.
- Importaciones.
- Alertas.

### 🗂️ Estructura actual

```text
stock_grupo_fantasia/
├── README.md
├── design-system.md
├── product-definition.md
├── prototype.html
├── reference-analysis.md
└── screen-specification.md
```

### 📖 Documentación

| Documento | Contenido |
| --- | --- |
| [Product Definition](./product-definition.md) | Visión, arquitectura funcional, reglas y roadmap |
| [Screen Specification](./screen-specification.md) | Pantallas, estados, acciones y validaciones |
| [Design System](./design-system.md) | Tokens, componentes, responsive y accesibilidad |
| [Reference Analysis](./reference-analysis.md) | Análisis de las referencias visuales |
| [Prototype](./prototype.html) | Experiencia interactiva propuesta |

---

## 🖥️ Cómo ver el prototipo

El prototipo no requiere instalación ni dependencias.

### Opción 1 — Descargar el repositorio

```bash
git clone https://github.com/juan-facundo-lopez/stock-grupo-fantasia.git
cd stock-grupo-fantasia
```

Después, abrir `prototype.html` en el navegador.

### Opción 2 — Abrirlo desde Windows

```powershell
Start-Process .\prototype.html
```

> [!NOTE]
> La tipografía Poppins y los iconos Lucide se cargan desde internet.

---

## 🗺️ Roadmap

### 0. Reglas y migración

- Auditar los Excel actuales.
- Revisar el formato real del reporte de ventas.
- Normalizar productos, SKU, ubicaciones y unidades.
- Definir fecha de corte.

### 1. Fundaciones

- Autenticación e invitaciones.
- Organizaciones.
- Ubicaciones.
- Catálogo.
- Auditoría base.

### 2. Inventario operativo

- Saldos.
- Entradas y salidas.
- Ajustes.
- Recuentos físicos.
- Historial.
- Control de concurrencia.

### 3. Transferencias

- Despacho.
- Stock en tránsito.
- Recepción total o parcial.

### 4. Ventas

- Importación CSV/XLSX.
- Mapeo de columnas.
- Validación.
- Detección de duplicados.
- Reversión.

### 5. Alertas

- Mínimos.
- Objetivos.
- Tiempo de fabricación.
- Cobertura estimada.

### 6. Piloto

- Migración inicial.
- Pruebas con datos reales.
- Uso paralelo controlado.
- Cierre definitivo de Excel.

---

## 🧪 Criterios de éxito del MVP

- [ ] Cada saldo puede explicarse mediante movimientos.
- [ ] Dos administradores pueden operar sin sobrescribirse.
- [ ] Las transferencias nunca desaparecen entre origen y destino.
- [ ] Los archivos duplicados son detectados.
- [ ] Las importaciones pueden auditarse y revertirse.
- [ ] Los recuentos físicos corrigen diferencias de forma trazable.
- [ ] Las ventas muestran su fecha real de actualización.
- [ ] Las ubicaciones son configurables.
- [ ] Las alertas conducen a una acción concreta.
- [ ] Las tareas frecuentes pueden completarse en menos de un minuto.

---

## 🤝 Colaboración

Antes de comenzar el desarrollo:

1. Leer la [definición del producto](./product-definition.md).
2. Revisar las [pantallas y reglas](./screen-specification.md).
3. Respetar el [Design System](./design-system.md).
4. No modificar reglas de stock sin documentar la decisión.
5. Mantener separadas la lógica operativa y la presentación visual.

### Convención para decisiones

Toda decisión importante debería indicar:

- Problema observado.
- Alternativas consideradas.
- Decisión tomada.
- Impacto esperado.
- Riesgos o limitaciones.

---

## ❓ Preguntas frecuentes

### ¿El sistema ya puede utilizarse en los restaurantes?

No. Actualmente existe documentación y un prototipo visual.

### ¿El prototipo guarda información?

No. Sus interacciones son demostrativas y no están conectadas a una base de datos.

### ¿La tecnología de desarrollo ya está elegida?

No. El stack debe decidirse al comenzar la implementación.

### ¿Puede adaptarse a otras empresas?

Sí. El modelo contempla organizaciones y ubicaciones configurables para facilitar una futura evolución SaaS.

---

## 📜 Licencia

Este repositorio todavía no tiene una licencia definida. Hasta que se agregue una, el código y la documentación conservan todos sus derechos.

---

<div align="center">

**Stock Grupo Fantasía**

Menos Excel. Más claridad. Mejor inventario. ✨

</div>

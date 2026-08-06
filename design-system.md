# Design System — Stock Grupo Fantasía

Versión 2.0, derivada de las referencias visuales aprobadas. Este documento define la capa visual; no modifica arquitectura, rutas, contenido ni comportamiento.

## Principios

### Claridad premium

La sofisticación nace de proporciones, tipografía, ritmo y contraste. No se utilizan sombras de ningún tipo.

### Aire con densidad operativa

Las cabeceras y secciones usan espacio generoso. Tablas, listas y formularios siguen siendo eficientes y escaneables.

### Color con función

Los pasteles agrupan y jerarquizan métricas. Los estados operativos utilizan tokens semánticos y nunca dependen solo del color.

### Una superficie dominante

Cada pantalla puede tener un bloque protagonista, pero no varias tarjetas compitiendo por atención.

### Interacción predecible

Hover, foco, selección, error y carga conservan patrones idénticos en toda la aplicación.

## Fundamentos

### Tipografía

Familia principal: **Poppins**, cargada desde Google Fonts, con fallback `ui-sans-serif`, `system-ui` y `sans-serif`.

| Token | Tamaño / interlineado | Peso | Uso |
| --- | --- | --- | --- |
| Display | 30 / 38 | 600 | Bienvenida o título excepcional |
| Page title | 26 / 34 | 600 | Título principal |
| Section title | 18 / 26 | 600 | Encabezado de sección |
| Card title | 14 / 21 | 600 | Tarjetas y paneles |
| Body | 13 / 20 | 400 | Contenido general |
| Body strong | 13 / 20 | 500 | Labels y valores secundarios |
| Caption | 11 / 17 | 400 | Metadatos y ayuda |
| Overline | 10 / 15 | 600 | Agrupadores de navegación |
| KPI | 27 / 33 | 600 | Valores destacados |

Reglas:

- Tracking negativo leve en Display, Page title y KPI.
- Números tabulares para stock, fechas y cantidades.
- Máximo tres niveles tipográficos visibles dentro de una tarjeta.
- El texto secundario nunca baja de 12 px.

### Espaciado

Retícula base de **8 px**, con medios pasos de 4 px para ajustes internos.

| Token | Valor | Uso |
| --- | --- | --- |
| 0.5 | 4 px | Separación fina |
| 1 | 8 px | Icono y label |
| 1.5 | 12 px | Controles compactos |
| 2 | 16 px | Filas y grupos internos |
| 3 | 24 px | Padding estándar |
| 4 | 32 px | Separación de bloques |
| 5 | 40 px | Secciones principales |
| 6 | 48 px | Ritmo de página |
| 8 | 64 px | Espacios excepcionales |

### Color

#### Neutros

| Token | Valor | Uso |
| --- | --- | --- |
| Canvas | `#F7F8FA` | Fondo exterior |
| Surface | `#FFFFFF` | Sidebar, header y paneles |
| Surface subtle | `#FAFAFB` | Hover y agrupaciones |
| Surface strong | `#F3F4F6` | Selección neutral |
| Text primary | `#111318` | Títulos y valores |
| Text secondary | `#69707D` | Subtítulos |
| Text tertiary | `#9298A3` | Metadatos |
| Border | `#E9EAED` | Divisores |
| Border strong | `#DADDE2` | Controles activos |

#### Marca y acciones

| Token | Valor | Uso |
| --- | --- | --- |
| Ink | `#18191D` | Botón primario y selección |
| Ink hover | `#2A2C31` | Hover primario |
| Focus | `#6D63E8` | Anillo de foco |
| Teal | `#159A91` | Visualización protagonista |
| Teal dark | `#0F766E` | Contraste sobre fondos claros |

#### Pasteles para métricas

| Token | Valor | Intención |
| --- | --- | --- |
| Peach | `#FFF0E4` | Atención moderada |
| Sage | `#EEF6E9` | Estado saludable |
| Lavender | `#EEF0FF` | Información general |
| Aqua | `#EAF6F5` | Flujo o tránsito |
| Butter | `#FFF6D9` | Advertencia suave |

Los pasteles se usan como fondos. El texto permanece oscuro con contraste AA.

#### Estados

| Estado | Texto | Fondo |
| --- | --- | --- |
| Correcto | `#237A57` | `#EAF7F0` |
| Información | `#3468A6` | `#EBF3FC` |
| Advertencia | `#9A6508` | `#FFF5D9` |
| Crítico | `#B54747` | `#FDECEC` |

### Bordes y separación

- El canvas principal es blanco puro. Las superficies blancas usan un outline de 1 px `#ECEEF2`; las superficies pastel o semánticas no llevan stroke.
- Radio de controles: 10 px.
- Radio de tarjetas pequeñas: 14 px.
- Radio de tarjetas principales: 16 px.
- Radio de modales y drawers: 18 px.
- Pills y badges: radio completo.
- Sombras: ninguna.

Menús, tooltips, modales y toasts se separan mediante color y outline sutil, nunca mediante sombras. El foco accesible conserva un outline temporal.

### Iconografía

Biblioteca: **Lucide**.

- 16 px en tablas y controles.
- 18 px en sidebar.
- 20 px en acciones principales.
- Stroke entre 1.75 y 2.
- Iconos decorativos con `aria-hidden`.
- Acciones icon-only con nombre accesible y tooltip.

## Layout

### Desktop

- Sidebar: 248 px.
- Header: 72 px.
- Contenido: fluido, máximo 1440 px.
- Padding horizontal: 32 px a 40 px.
- Grid: 12 columnas, gutter de 24 px.
- Separación vertical de secciones: 32 px.

### Tablet

- Sidebar colapsada: 80 px.
- Contenido: 24 px de margen.
- Grid: 8 columnas, gutter de 16 px.
- Los bloques dobles pasan a una columna.

### Mobile

- Navegación inferior fija: 64 px, siempre visible.
- Los labels del footer conservan el mismo color; solamente el icono activo cambia a `#6D63E8`.
- Header: 56 px.
- Margen: 16 px.
- Grid: 4 columnas, gutter de 12 px.
- Objetivos táctiles: mínimo 44 por 44 px.
- Las tablas se convierten en filas responsivas; no se comprimen hasta ser ilegibles.

## Componentes

### App shell

- Canvas gris casi blanco.
- Sidebar y header blancos, separados del canvas mediante contraste de superficie y espacio, sin borde persistente.
- Contenido sin marco exterior en la aplicación real.
- El prototipo puede conservar un marco para presentación.

### Sidebar

- Marca con wordmark sobrio.
- Secciones mediante overlines de 11 px.
- Ítems de 44 px de alto y radio de 12 px.
- El ítem activo no cambia de fondo: solamente su icono pasa a `#6D63E8`.
- Inactivos con texto secundario e iconos terciarios.
- Badge de contador compacto y semántico.
- Perfil anclado visualmente al pie.

### Header

- Altura de 72 px.
- Búsqueda de 36–40 px de alto.
- Acciones secundarias iconográficas.
- Una sola acción primaria.
- Sin títulos duplicados con el contenido.

### Page header

- Título de 30 px.
- Subtítulo de 14 px a 8 px del título.
- Acciones alineadas arriba.
- Margen inferior de 32 px.

### KPI card

- Altura recomendada: 144–160 px.
- Padding: 24 px.
- Radio: 16 px.
- Label, valor, contexto y acción secundaria.
- Fondos pastel alternados con intención estable.
- Hover: cambio leve de fondo, sin traslación ni sombra.

### Card y panel

- Padding: 24 px.
- Título y acción en una fila.
- Contenido separado por 20–24 px.
- Evitar tarjetas anidadas. Los subgrupos usan fondo suave o separadores.

### Botones

Tamaños:

- Small: 32 px.
- Medium: 40 px.
- Large: 44 px.

Variantes:

- Primary: fondo Ink, texto blanco.
- Secondary: superficie gris muy clara, sin borde.
- Ghost: sin fondo, hover gris.
- Destructive: texto o fondo rojo según criticidad.
- Icon: cuadrado, mismo alto que su grupo.

Estados: default, hover, pressed, focus, loading y disabled. Transición de 160 ms.

### Inputs y selects

- Altura: 40 px.
- Radio: 10 px.
- Fondo blanco.
- Sin borde persistente; foco con anillo Focus de 3 px translúcido.
- Label persistente encima.
- Ayuda o error debajo.
- Placeholder con contraste secundario, no usado como label.

### Tabs y segmented controls

- Tabs de página con indicador inferior de 2 px.
- Segmented control dentro de una superficie gris suave.
- La selección combina fondo, texto y estado accesible.

### Tabla

- Encabezado de 12 px, peso 500 y texto secundario.
- Filas de 56–64 px.
- Solo divisores horizontales.
- Hover suave.
- Valores numéricos alineados a la derecha.
- Estado y acción nunca dependen de hover para ser descubribles.
- En mobile se transforma en lista semántica.

### Badge

- Alto: 24 px.
- Padding horizontal: 8 px.
- Texto: 12 px, peso 500.
- Punto o icono opcional.
- Estado expresado mediante texto y color.

### Modal y dialog

- Ancho según contenido, máximo operativo de 640 px.
- Radio: 18 px.
- Padding interno: 24 px.
- Header y footer separados mediante fondo o espacio cuando hay scroll, sin stroke persistente.
- Overlay neutral al 35 % con blur muy leve.
- Foco atrapado en implementación real.

### Drawer

- 480–520 px en desktop; pantalla completa en mobile.
- Fondo blanco con outline lateral gris muy sutil.
- Cabecera estable y contenido con ritmo de 24 px.

### Menús y dropdowns

- Radio: 12 px.
- Padding exterior: 6 px.
- Ítem: 36–40 px.
- Outline gris claro de 1 px, sin sombra.
- Atajos alineados a la derecha con texto terciario.

### Tooltip

- Fondo Ink, texto blanco.
- Radio: 8 px.
- Padding: 6 por 8 px.
- Texto: 12 px.
- Aparece después de 350 ms y también por foco.

### Toast

- Ancho adaptado al contenido, máximo 420 px.
- Icono semántico, título opcional y mensaje.
- 16 px de padding y radio de 12 px.
- No desaparece automáticamente si requiere una decisión.

### Formularios

- Una columna para formularios de decisión.
- Dos columnas solo para campos cortos y relacionados.
- Separación entre campos: 16 px.
- Secciones separadas por 24–32 px.
- Resumen de impacto antes de confirmar una operación de stock.

### Paginación

- Resumen de resultados a la izquierda.
- Controles Atrás/Siguiente y página actual a la derecha.
- Objetivos de 36 px y estado disabled claro.

### Breadcrumbs

- Texto de 12–13 px.
- Separador ChevronRight.
- Solo en jerarquías con tres o más niveles o cuando el usuario pierde contexto.

### Empty state

- Icono monolineal dentro de superficie pastel muy suave.
- Título, explicación breve y una acción.
- Sin ilustraciones grandes ni lenguaje celebratorio.

### Loader y skeleton

- Skeleton con forma del contenido final.
- Tono neutral, animación suave de 1.4 s.
- Spinner solo en acciones puntuales.
- Respeta `prefers-reduced-motion`.

### Gráficos

- Un gráfico protagonista por pantalla.
- Teal como serie principal; crema como contraste sobre fondo teal.
- Ejes y grilla muy sutiles.
- Labels directos cuando sea posible.
- Tooltip con valor, unidad y período.
- Barras con radio entre 6 y 8 px.
- No usar 3D, gradientes, leyendas redundantes ni animación de entrada decorativa.

## Estados interactivos

### Hover

- 150–180 ms.
- Cambio leve de fondo, sin elevación.
- Desplazamiento máximo de 1 px solo en tarjetas accionables.

### Focus

- Anillo de 3 px con Focus al 18 %.
- Nunca eliminar el outline sin reemplazo equivalente.

### Pressed

- Contraste levemente mayor.
- Sin escalado perceptible que produzca saltos.

### Disabled

- Opacidad visual reducida con contraste legible.
- Cursor y estado nativo coherentes.

### Error

- Mensaje junto al control.
- Icono, texto y fondo suave; nunca solo color o stroke rojo.
- Datos ingresados preservados.

## Movimiento

- Hover y foco: 150–180 ms.
- Menú y tooltip: 150 ms.
- Modal: 180–220 ms.
- Drawer: 220–250 ms.
- Toast: 180 ms.
- Sin rebotes, confeti, contadores animados ni loops.

## Accesibilidad

- Contraste WCAG AA.
- Foco visible en todos los controles.
- Navegación completa por teclado.
- Color siempre acompañado por texto o icono.
- Objetivos táctiles de al menos 44 px en mobile.
- Labels persistentes en formularios.
- Encabezados semánticos en tablas.
- Lectura correcta de modales, alertas y toasts.
- Respeto de `prefers-reduced-motion`.

## Criterio de consistencia

Antes de crear una variante nueva debe comprobarse si el componente puede resolverse mediante tamaño, estado o token existente. Las excepciones visuales deben corresponder a una diferencia real de jerarquía o comportamiento, nunca a una pantalla aislada.

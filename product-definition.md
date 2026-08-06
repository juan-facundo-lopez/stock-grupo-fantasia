# Definición del producto

## Visión

Stock Grupo Fantasía será la fuente única y auditable de inventario para la oficina central y los restaurantes del grupo. Debe reemplazar los Excel actuales sin adoptar la complejidad ni la apariencia de un ERP tradicional.

La experiencia debe sentirse rápida, sobria y directa, con referencias visuales cercanas a Linear, Notion, Stripe Dashboard, Vercel y Raycast.

## Objetivos del MVP

- Conocer el stock físico por producto y ubicación.
- Entender qué entró, qué salió, cuándo y quién lo registró.
- Trasladar productos sin perder visibilidad durante el transporte.
- Incorporar el reporte externo de ventas de forma segura y repetible.
- Detectar faltantes y anticipar necesidades de fabricación.
- Permitir que varios administradores trabajen sin sobrescribirse.
- Eliminar la dependencia operativa de Excel.

## Principios

### Rapidez antes que configuración

Las tareas habituales deben requerir pocos pasos. La configuración avanzada aparece solo cuando agrega valor.

### El stock debe poder explicarse

Cada unidad debe relacionarse con una entrada, salida, venta, transferencia, devolución, merma o ajuste.

### Mostrar problemas, no decorar

El dashboard prioriza productos críticos, transferencias pendientes y ventas desactualizadas. Evita gráficos genéricos y sumas poco accionables.

### Honestidad del dato

Cuando las ventas solo se cargan mensualmente, la aplicación debe mostrar hasta qué fecha está actualizado el stock derivado de ventas.

## Arquitectura funcional

### Identidad y organización

- Organización aislada como tenant.
- Administradores invitados; no existe registro público.
- Roles iniciales: Propietario y Administrador.
- Registro de actividad sensible.
- Idioma, zona horaria y formatos configurables por organización.

### Catálogo

- Productos con nombre, SKU, categoría y unidad.
- Imagen y código de barras opcionales.
- Estado activo/inactivo.
- Tiempo de fabricación y reglas de reposición.
- SKU único dentro de la organización.

### Ubicaciones

Las ubicaciones son entidades configurables: oficina, restaurante, almacén o ubicación temporal. En tránsito es un estado operativo del stock, no un restaurante ficticio.

### Inventario basado en movimientos

El saldo se calcula mediante el historial:

> Stock físico = saldo inicial + entradas + recepciones + devoluciones − salidas − ventas − transferencias enviadas ± ajustes

No existe una edición silenciosa del stock. Los movimientos confirmados son inmutables; los errores se corrigen mediante reversión o ajuste.

### Operaciones

- Entrada
- Salida
- Transferencia
- Recepción
- Ajuste
- Recuento físico
- Importación de ventas
- Reversión

Cada operación puede contener varios productos y debe guardarse de forma atómica.

### Importaciones

Cada archivo crea un lote identificable con:

- Archivo original
- Período
- Usuario
- Fecha de carga
- Perfil de columnas
- Equivalencias utilizadas
- Filas procesadas y rechazadas
- Movimientos generados
- Estado y posible reversión

La detección de duplicados considera el contenido, el período y las ubicaciones, no solamente el nombre del archivo.

### Alertas

Las reglas pueden configurarse por producto y ubicación:

- Stock mínimo
- Stock objetivo
- Tiempo de fabricación
- Margen de seguridad
- Consumo histórico

Sin historial suficiente se utiliza el mínimo. Con tres o más períodos completos se puede estimar cobertura sin presentar falsa precisión.

## Modelo conceptual

| Entidad | Responsabilidad |
| --- | --- |
| Organización | Propietaria de usuarios y datos |
| Administrador | Persona con acceso operativo |
| Ubicación | Lugar físico configurable |
| Producto | Artículo del catálogo |
| Categoría | Agrupación del catálogo |
| Regla de stock | Mínimo, objetivo y fabricación |
| Operación | Cabecera transaccional |
| Línea de operación | Producto, cantidad y saldo asociado |
| Transferencia | Despacho, tránsito y recepción |
| Importación | Lote del reporte externo |
| Alerta | Condición accionable |
| Evento de auditoría | Cambio administrativo o sensible |

## Navegación

### Principal

1. Resumen
2. Inventario
3. Movimientos
4. Carga de ventas
5. Alertas
6. Configuración

### Decisiones de simplificación

- Productos es una pestaña de Inventario.
- Transferencias es una vista especializada de Movimientos.
- Historial es el registro de Movimientos.
- Administradores y Ubicaciones viven en Configuración.

## Flujos principales

### Consultar y modificar stock

Login → Resumen → Inventario → Producto → Nueva operación → Revisar impacto → Confirmar → Historial.

Antes de confirmar, el servidor revalida la disponibilidad. Si otro administrador cambió el saldo, el usuario debe revisar el nuevo resultado.

### Transferencia

Origen y destino → Productos → Confirmar despacho → En tránsito → Confirmar cantidades recibidas → Actualizar destino.

Una recepción parcial conserva las unidades restantes en tránsito y registra cualquier diferencia.

### Recuento físico

Ubicación → Conteo → Comparación esperado/real → Justificación → Movimientos de ajuste → Documento de recuento.

### Ventas

Archivo → Mapeo de columnas → Validación → Resolución de equivalencias → Vista previa → Confirmación → Lote auditable.

### Alerta

Alerta → Revisar cobertura y disponibilidad en otras ubicaciones → Transferir, fabricar, registrar entrada o modificar regla → Resolución automática.

## Reglas de negocio

- El stock negativo está bloqueado por defecto.
- Toda operación tiene fecha efectiva y fecha de registro.
- Un movimiento confirmado no puede editarse.
- Una reversión necesita motivo y referencia al original.
- Un producto con historial se desactiva, no se elimina.
- Una ubicación con saldo no puede desactivarse.
- La organización siempre conserva al menos un propietario.
- Las cantidades respetan la precisión de su unidad.
- Los filtros y búsquedas no alteran datos.
- Una importación no actualiza stock hasta la confirmación final.
- Toda mutación se realiza como una transacción indivisible.

## Riesgo: ventas mensuales

Si las ventas se importan una vez al mes, el sistema no conoce el consumo ocurrido después del último archivo. Por eso debe mostrar siempre la fecha de actualización y utilizar un margen de seguridad para alertas.

El MVP acepta archivos mensuales o más frecuentes sin cambiar su arquitectura. Una integración diaria o carga semanal queda como evolución operativa.

## Roles

### Propietario

- Todas las operaciones
- Administradores
- Organización
- Reversión de importaciones
- Exportación completa

### Administrador

- Catálogo
- Inventario
- Movimientos
- Transferencias
- Importaciones
- Alertas

## Migración desde Excel

1. Auditar los archivos actuales.
2. Importar ubicaciones.
3. Importar catálogo y resolver SKU duplicados.
4. Definir unidades.
5. Importar saldos como movimientos de Inventario inicial.
6. Realizar un conteo físico.
7. Resolver diferencias.
8. Fijar una fecha de corte.
9. Mantener los Excel anteriores solo como archivo histórico.

## Fuera del MVP

- Facturación
- Contabilidad
- Proveedores completos
- Órdenes de compra o fabricación
- Reservas de stock
- Kits o productos compuestos
- API pública
- Integraciones automáticas
- Roles personalizados
- Aplicaciones nativas

## Roadmap

### Fase 0 — Reglas y datos

Auditoría de Excel, formato real de ventas, unidades, tipos de movimiento, política de negativos y fecha de corte.

### Fase 1 — Fundaciones

Identidad, organización, ubicaciones, catálogo, auditoría e importación inicial.

### Fase 2 — Inventario operativo

Saldos, entradas, salidas, ajustes, recuentos, historial, filtros y concurrencia.

### Fase 3 — Transferencias

Despacho, tránsito, recepción y diferencias.

### Fase 4 — Ventas

CSV/XLSX, perfiles, equivalencias, validación, duplicados, vista previa y reversión.

### Fase 5 — Alertas

Mínimos, objetivos, fabricación, cobertura y resolución accionable.

### Fase 6 — Piloto

Responsive, accesibilidad, rendimiento, migración, operación paralela controlada y cierre de Excel.

## Criterios de aprobación del MVP

- Cada saldo puede explicarse mediante movimientos.
- Las operaciones concurrentes no se sobrescriben.
- Las transferencias no desaparecen entre origen y destino.
- Los duplicados de ventas se detectan.
- Las importaciones pueden auditarse y revertirse.
- Los recuentos corrigen diferencias de forma trazable.
- Las ventas muestran su fecha real de actualización.
- Las ubicaciones son configurables.
- Las alertas conducen a una acción concreta.
- Las tareas frecuentes pueden completarse en menos de un minuto.

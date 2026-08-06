# Stock Grupo Fantasía — Diseño de producto

Esta carpeta contiene la definición de producto aprobada para el MVP. Todavía no contiene implementación de la aplicación.

## Entregables

- [Definición del producto](./product-definition.md): arquitectura funcional, navegación, flujos, reglas de negocio y roadmap.
- [Especificación de pantallas](./screen-specification.md): contenido, acciones, validaciones y criterios por pantalla.
- [Sistema de diseño](./design-system.md): fundamentos visuales, componentes, estados y comportamiento responsive.
- [Análisis de referencias](./reference-analysis.md): decisiones visuales detectadas y criterios de adaptación.
- [Prototipo navegable](./prototype.html): recorrido interactivo de los flujos principales.

## Decisiones aprobadas

1. El stock se deriva de movimientos y nunca se edita directamente.
2. Inventario y Productos viven dentro de una misma área.
3. Historial forma parte de Movimientos.
4. Las transferencias utilizan el estado En tránsito.
5. El recuento físico forma parte del MVP.
6. La interfaz muestra hasta qué fecha están actualizadas las ventas.
7. Las ubicaciones son configurables y no están programadas como restaurantes fijos.
8. Los errores se corrigen mediante reversión o ajuste, preservando la auditoría.

## Estado

**Fase actual:** rediseño visual aplicado al prototipo y pendiente de validación final.

El desarrollo debe comenzar únicamente después de aprobar el prototipo, las reglas operativas y el formato real del archivo de ventas.

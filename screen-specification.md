# Especificación de pantallas

## Patrones globales

- Cada página tiene un título, contexto breve y una sola acción primaria.
- Los filtros permanecen en la página y conservan el estado al abrir un detalle.
- Los detalles se abren en panel lateral.
- Las mutaciones breves se realizan en diálogo.
- Los procesos complejos usan pasos a pantalla completa.
- El sistema nunca comunica éxito antes de confirmar la transacción.
- Los conflictos concurrentes muestran el nuevo saldo y solicitan revisión.

## Acceso

### Login

**Contenido:** email, contraseña, mostrar/ocultar, recuperar acceso e iniciar sesión.

**Reglas:** no existe registro público; los errores no revelan si un email existe; después del acceso se recupera el destino original.

### Activación de invitación

**Contenido:** organización, nombre, email bloqueado, nueva contraseña y expiración.

**Estados:** invitación válida, vencida, ya utilizada o revocada.

### Recuperación

Solicitud por email, confirmación neutra y definición de nueva contraseña. El usuario puede cerrar sus otras sesiones.

## Resumen

**Objetivo:** presentar trabajo pendiente.

**Contenido:** fecha de actualización de ventas, productos críticos, transferencias en tránsito, estado por ubicación y actividad reciente.

**Acciones:** revisar alertas, recibir transferencia, cargar ventas, abrir inventario y crear movimiento.

**Reglas:** los problemas aparecen antes que las métricas; cada bloque abre una vista filtrada; no se suman unidades heterogéneas como indicador principal.

## Inventario

### Stock — lista

**Columnas:** producto, SKU, stock total, estado y actualización.

**Filtros:** búsqueda, ubicación, categoría, estado y actividad.

**Acciones:** abrir producto, registrar movimiento, cambiar a matriz y exportar.

### Stock — matriz

Una fila por producto y una columna por ubicación seleccionada. La primera columna queda fija en desktop. En mobile se transforma en un listado con desglose por producto.

### Catálogo

**Columnas:** producto, SKU, categoría, unidad, reglas y estado.

**Acciones:** crear, editar, desactivar, importar y exportar.

### Detalle de producto

**Cabecera:** nombre, SKU, categoría, unidad, estado y actualización.

**Contenido:** stock físico, en tránsito, cobertura, desglose por ubicación, reglas y actividad reciente.

**Acciones:** entrada, salida, transferencia, ajuste, edición e historial.

### Crear o editar producto

**Obligatorios:** nombre, SKU y unidad.

**Opcionales:** categoría, descripción, imagen, código de barras, mínimo, objetivo y tiempo de fabricación.

El SKU es único. Los productos con historial solo pueden desactivarse.

## Operaciones

### Entrada

Ubicación receptora, fecha efectiva, productos, cantidades, motivo, referencia y nota. Muestra el saldo resultante antes de confirmar.

### Salida

Ubicación, fecha, productos, cantidades, motivo y nota. Bloquea cantidades superiores al disponible y vuelve a validar al confirmar.

### Transferencia

Origen, destino, fecha, productos, cantidades y nota. El despacho descuenta del origen y crea stock en tránsito.

### Recepción

Muestra enviado, recibido y diferencia por línea. Permite recepción parcial; el remanente continúa en tránsito.

### Recuento físico

Ubicación, categoría opcional, esperado, contado, diferencia y motivo. La confirmación genera movimientos de ajuste y un documento de recuento.

## Movimientos

### Listado

**Pestañas:** todos, transferencias, entradas, salidas, ajustes e importaciones.

**Filtros:** texto, tipo, ubicación, usuario, fecha, estado y producto.

**Columnas:** tipo/referencia, origen/destino, productos, usuario, fecha efectiva, fecha de registro y estado.

### Detalle

Identificador, tipo, estado, usuario, líneas, saldos antes/después, motivo, notas, importación asociada, eventos y reversión.

### Reversión

Disponible desde el detalle. Requiere motivo, muestra el impacto inverso y nunca elimina el movimiento original.

## Carga de ventas

### Archivo

Selector o arrastre de CSV/XLSX. El sistema informa formatos y límite. Subir no modifica stock.

### Mapeo

Relaciona SKU/producto, cantidad, ubicación y fecha/período. Puede guardarse como perfil.

### Validación

Clasifica filas correctas, desconocidas, duplicadas, inválidas y fuera de período. Las equivalencias se resuelven sin abandonar el flujo.

### Impacto

Muestra período, ubicaciones, filas, unidades descontadas, productos afectados, alertas resultantes y duplicados potenciales.

### Resultado

Presenta lote, procesadas/rechazadas, fecha de actualización, movimientos creados, errores descargables y archivo original.

### Historial de importaciones

Período, archivo, usuario, fecha, filas, estado y reversión. El detalle conserva mapeos y equivalencias.

## Alertas

### Listado

Prioriza Reponer ahora, Reponer antes de, Bajo mínimo y Sin información suficiente.

Muestra producto, ubicación, stock, mínimo, tránsito, consumo, cobertura y recomendación.

### Resolución

Permite transferir, registrar fabricación/entrada, modificar regla o marcar revisada. La alerta se cierra automáticamente al desaparecer la condición.

## Configuración

### Ubicaciones

Nombre, tipo, código, dirección opcional, responsable y estado. Una ubicación con saldo no se desactiva.

### Administradores

Nombre, email, rol, estado y último acceso. Permite invitar, reenviar, cambiar rol y desactivar. Siempre debe existir un propietario.

### Organización

Nombre, logotipo, idioma, zona horaria, fecha, política de negativos y margen de seguridad.

### Perfiles de importación

Nombre, software de origen, columnas, equivalencias, último uso y estado.

### Auditoría

Cambios de catálogo, reglas, ubicaciones, administradores, importaciones y reversiones.

### Perfil personal

Nombre, email, contraseña, sesiones y cierre de sesión.

## Estados de sistema

### Sin datos

Explica por qué está vacío y ofrece una acción contextual. Nunca muestra ilustraciones decorativas como sustituto de la explicación.

### Carga

Skeletons con la forma del contenido. Los filtros mantienen visible la información anterior. Los botones muestran Guardando, Validando o Confirmando.

### Error

Mensajes concretos, acción de recuperación e identificador de incidente cuando corresponde. Los formularios conservan sus valores.

### Conflicto concurrente

Informa el stock actualizado, la operación que cambió y solicita revisar antes de confirmar.

### Sin conexión

La aplicación puede conservar consultas cacheadas, pero no confirma movimientos hasta recuperar conexión.

### Permisos y sesión expirada

Explican la causa y ofrecen volver al resumen o iniciar sesión manteniendo el destino original.

## Responsive

### Desktop

Sidebar persistente, tablas completas, panel lateral, atajos de teclado y carga de ventas optimizada para pantalla amplia.

### Mobile

Navegación inferior, filas compactas, filtros en panel inferior, cantidades con teclado numérico y recepción de transferencias optimizada para uso presencial.

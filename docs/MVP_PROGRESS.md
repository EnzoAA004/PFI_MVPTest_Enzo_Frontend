# MVP Frontend Progress

## Implementado

- Dashboard obtiene la lista de estudios desde el backend.
- La tabla de worklist puede abrir la fila seleccionada.
- El detalle seleccionado se guarda en `sessionStorage` para que el workspace de revision muestre el caso correspondiente.
- Los controles de visualizacion usan un icono CSS profesional en lugar de emojis.
- Las filas de la worklist son seleccionables y tienen boton `Abrir revision`.
- Dashboard e History muestran un estado de carga animado mientras hidratan datos desde backend/Postgres, evitando que aparezcan mocks antes del fetch.
- Resultados IA y revision calcula delta entre IA y Reviewer, ordena outliers/cambios relevantes arriba y conserva persistencia solo al guardar.
- El workspace de revision permite exportar un resumen academico de-identificado en JSON, CSV e informe HTML, sin imagenes crudas ni identificadores directos.
- El frontend envia JWT a endpoints protegidos de estudios, historial y revision.
- Logout revoca el refresh token en backend antes de limpiar la sesion local.
- La sesion se restaura desde almacenamiento asincronico del navegador.
- Login soporta doble verificacion opcional: si el profesional la deshabilita, ingresa directo con JWT.
- Settings incluye configuracion de doble verificacion por profesional.
- Settings incluye panel admin para aprobar o pausar profesionales.
- Un profesional pendiente de aprobacion ve una pantalla restringida y no accede a worklist/estudios.
- El primer ingreso de un profesional aprobado muestra un mini tutorial de uso de la herramienta.

## Pendiente

- Agregar endpoint backend de export si se quiere auditar descargas desde servidor.
- Reemplazar codigos demo por envio real de email/SMS si el alcance lo requiere.
- Persistir historial longitudinal completo por sujeto en tablas dedicadas.
- Conectar overlayUrl/maskContours reales cuando el AI Module entregue inferencia real.

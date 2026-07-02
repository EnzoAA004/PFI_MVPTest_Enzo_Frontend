# MVP Frontend Progress

## Implementado

- Dashboard obtiene la lista de estudios desde el backend.
- La tabla de worklist puede abrir la fila seleccionada.
- El detalle seleccionado se guarda en `sessionStorage` para que el workspace de revision muestre el caso correspondiente.
- Los controles de visualizacion usan un icono CSS profesional en lugar de emojis.
- Las filas de la worklist son seleccionables y tienen boton `Abrir revision`.
- Dashboard e History muestran un estado de carga animado mientras hidratan datos desde backend/Postgres, evitando que aparezcan mocks antes del fetch.
- Resultados IA y revision calcula delta entre IA y Reviewer, ordena outliers/cambios relevantes arriba y conserva persistencia solo al guardar.
- El workspace de revision permite exportar un resumen academico de-identificado en JSON y CSV, sin imagenes crudas ni identificadores directos.

## Pendiente

- Agregar endpoint backend de export si se quiere auditar descargas desde servidor.
- Proteger los endpoints de estudios con autenticacion real y roles cuando se cierre la etapa demo.
- Persistir historial longitudinal completo por sujeto en tablas dedicadas.
- Conectar overlayUrl/maskContours reales cuando el AI Module entregue inferencia real.

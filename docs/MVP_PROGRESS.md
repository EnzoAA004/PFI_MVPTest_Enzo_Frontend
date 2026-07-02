# MVP Frontend Progress

## Implementado

- Dashboard obtiene la lista de estudios desde el backend.
- La tabla de worklist puede abrir la fila seleccionada.
- El detalle seleccionado se guarda en `sessionStorage` para que el workspace de revision muestre el caso correspondiente.
- Los controles de visualizacion usan un icono CSS profesional en lugar de emojis.
- Las filas de la worklist son seleccionables y tienen boton `Abrir revision`.
- Dashboard e History muestran un estado de carga animado mientras hidratan datos desde backend/Postgres, evitando que aparezcan mocks antes del fetch.

## Pendiente

- Mostrar delta entre valor IA y valor final del reviewer.
- Ordenar outliers y cambios relevantes arriba en Resultados IA y revision.
- Agregar export academico de revision.
- Proteger los endpoints de estudios con autenticacion real y roles cuando se cierre la etapa demo.

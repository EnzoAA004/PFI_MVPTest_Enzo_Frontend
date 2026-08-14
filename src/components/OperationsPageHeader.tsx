import type { ReactNode } from "react";

/**
 * Encabezado de las pantallas operativas.
 *
 * No lleva antetítulo ni bajada. La barra lateral ya dice en qué sección está
 * el usuario, así que un "ESTUDIOS" sobre el título "Lista de trabajo" repite
 * lo que la navegación ya marcó, y "Revisión y seguimiento de estudios
 * procesados" describe la pantalla a alguien que ya la está mirando. Las dos
 * líneas empujaban la primera fila de datos ~40 px hacia abajo en cada
 * pantalla, que en una lista de trabajo es una fila menos visible.
 *
 * `description` sigue existiendo para lo que no es obvio —una restricción, el
 * origen de los datos—, pero es opcional y la mayoría de las pantallas no la
 * necesita.
 */
interface OperationsPageHeaderProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function OperationsPageHeader({ title, description, meta, actions }: OperationsPageHeaderProps) {
  return (
    <header className="operations-page-header">
      <div className="operations-page-heading">
        <div className="operations-title-line">
          <h1>{title}</h1>
          {meta}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="operations-page-actions">{actions}</div> : null}
    </header>
  );
}

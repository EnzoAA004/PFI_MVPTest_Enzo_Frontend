import type { ReactNode } from "react";

interface OperationsPageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function OperationsPageHeader({ eyebrow, title, description, meta, actions }: OperationsPageHeaderProps) {
  return (
    <header className="operations-page-header">
      <div className="operations-page-heading">
        {eyebrow ? <span className="operations-eyebrow">{eyebrow}</span> : null}
        <div className="operations-title-line">
          <h1>{title}</h1>
          {meta}
        </div>
        <p>{description}</p>
      </div>
      {actions ? <div className="operations-page-actions">{actions}</div> : null}
    </header>
  );
}

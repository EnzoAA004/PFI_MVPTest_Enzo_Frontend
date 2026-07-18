type AuditEvent = { id: string; timestamp: string; actor: string; action: string; detail: string };

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe requires keyboard focus for scrollable audit regions.
    <div className="audit-list" tabIndex={0} role="region" aria-label="Registro de auditoría">
      {events.slice(0, 8).map((event) => (
        <article key={event.id}>
          <span>{new Date(event.timestamp).toLocaleString()}</span>
          <strong>{event.action}</strong>
          <p>{event.detail}</p>
          <small>{event.actor}</small>
        </article>
      ))}
    </div>
  );
}

type AuditEvent = { id: string; timestamp: string; actor: string; action: string; detail: string };

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <div className="audit-list">
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

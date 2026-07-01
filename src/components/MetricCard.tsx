interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "teal" | "green" | "amber" | "purple";
}

export function MetricCard({ label, value, detail, tone = "blue" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

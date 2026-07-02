export function VisibilityIcon({ visible }: { visible: boolean }) {
  return <span className={visible ? "visibility-icon visibility-icon-on" : "visibility-icon visibility-icon-off"} aria-hidden="true" />;
}

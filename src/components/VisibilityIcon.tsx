export function VisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg className="visibility-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M2.25 12s3.75-6.25 9.75-6.25S21.75 12 21.75 12 18 18.25 12 18.25 2.25 12 2.25 12Z" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    );
  }

  return (
    <svg className="visibility-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.2 4.4 20.6 21.8" />
      <path d="M9.2 5.95A9.1 9.1 0 0 1 12 5.5C18 5.5 21.75 12 21.75 12a17.5 17.5 0 0 1-3.1 3.9" />
      <path d="M14.4 14.7A3.2 3.2 0 0 1 9.3 9.6" />
      <path d="M6.15 7.45A17.9 17.9 0 0 0 2.25 12S6 18.5 12 18.5a9 9 0 0 0 4.1-.98" />
    </svg>
  );
}

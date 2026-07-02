interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string;
  onChange: () => void;
}

export function ToggleSwitch({ checked, disabled, label, description, onChange }: ToggleSwitchProps) {
  return (
    <div className="ios-switch-row">
      <div className="ios-switch-copy">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={checked ? "ios-switch is-on" : "ios-switch is-off"}
        onClick={onChange}
      >
        <span className="ios-switch-thumb" />
      </button>
    </div>
  );
}

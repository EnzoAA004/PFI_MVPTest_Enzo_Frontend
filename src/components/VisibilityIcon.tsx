import { Eye, EyeOff } from "lucide-react";

export function VisibilityIcon({ visible }: { visible: boolean }) {
  const Icon = visible ? Eye : EyeOff;

  return (
    <Icon
      className="visibility-icon-svg"
      aria-hidden="true"
      focusable="false"
      strokeWidth={2.1}
    />
  );
}

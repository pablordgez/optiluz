import { useEffect, useState } from "react";
export function PowerLimit({
  value,
  disabled,
  onSave,
  onError,
}: {
  value: number;
  disabled: boolean;
  onSave: (value: number) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = /^[+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text.trim())
      ? Number(text.replace(",", "."))
      : NaN;
    if (!Number.isFinite(parsed) || parsed < 0.05 || parsed > 30) {
      setText(String(value));
      onError("El límite debe estar entre 0,05 y 30 kW.");
    } else if (parsed !== value) onSave(parsed);
  };
  return (
    <div className="unit-input">
      <input
        id="max-power"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span>kW</span>
    </div>
  );
}

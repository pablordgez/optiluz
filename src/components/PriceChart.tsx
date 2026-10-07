import { useState } from "react";
import { buildSlots, timeLabel, zoneFor } from "../domain/time";
import type { PriceDay } from "../domain/types";
export function PriceChart({ day }: { day: PriceDay }) {
  const [selected, setSelected] = useState<number | null>(null);
  const slots = buildSlots(day).filter((_, i) => i % 2 === 0);
  const sorted = [...day.prices].sort((a, b) => a - b);
  const cheap = sorted[Math.floor(sorted.length / 3)];
  const expensive = sorted[Math.floor((sorted.length * 2) / 3)];
  const min = Math.min(0, ...day.prices),
    max = Math.max(...day.prices, 0.01);
  const s = selected === null ? null : slots[selected];
  return (
    <>
      <div className="chart-info">
        <span>
          {s
            ? `${timeLabel(s.start, zoneFor(day.area), true)} – ${timeLabel(s.end + 1800000, zoneFor(day.area), true)}`
            : "Precio por hora"}
        </span>
        <strong>
          {s
            ? s.price.toFixed(4).replace(".", ",")
            : `${Math.min(...day.prices).toFixed(3)} – ${Math.max(...day.prices).toFixed(3)}`}{" "}
          <small>€/kWh</small>
        </strong>
      </div>
      <div className="price-chart" aria-label="Precios horarios">
        <div
          className="zero-line"
          style={{ bottom: `${(-min / (max - min)) * 100}%` }}
        />
        {slots.map((slot, i) => {
          const negative = slot.price < 0;
          return (
            <button
              key={slot.start}
              className={`price-column ${selected === i ? "selected" : ""}`}
              onClick={() => setSelected(i)}
              aria-label={`${slot.label}: ${slot.price.toFixed(4)} euros por kWh`}
              aria-pressed={selected === i}
              title={`${slot.label}: ${slot.price.toFixed(4)} €/kWh`}
            >
              <span
                className="bar"
                style={{
                  background:
                    slot.price <= cheap
                      ? "var(--cheap)"
                      : slot.price >= expensive
                        ? "var(--expensive)"
                        : "var(--medium)",
                  height: `${Math.max(2, (Math.abs(slot.price) / (max - min)) * 100)}%`,
                  bottom: `${negative ? ((slot.price - min) / (max - min)) * 100 : (-min / (max - min)) * 100}%`,
                }}
              />
              <span className="chart-hour">
                {i % 3 === 0 ? slot.label.split(":")[0] : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="chart-legend">
        <span>
          <i style={{ background: "var(--cheap)" }} />
          Menor precio
        </span>
        <span>
          <i style={{ background: "var(--medium)" }} />
          Intermedio
        </span>
        <span>
          <i style={{ background: "var(--expensive)" }} />
          Mayor precio
        </span>
      </div>
    </>
  );
}

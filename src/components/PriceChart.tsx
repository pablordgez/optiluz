import { useState } from "react";
import { buildSlots, timeLabel, zoneFor } from "../domain/time";
import type { PriceDay } from "../domain/types";
export function PriceChart({ day }: { day: PriceDay }) {
  const [selected, setSelected] = useState<number | null>(null);
  const slots = buildSlots(day).filter((_, i) => i % 2 === 0);
  const lowest = Math.min(...day.prices),
    highest = Math.max(...day.prices);
  const spread = highest - lowest;
  const cheap = lowest + spread / 3,
    expensive = lowest + (spread * 2) / 3;
  const min = Math.min(0, ...day.prices),
    max = Math.max(...day.prices, 0.01);
  const s = selected === null ? null : slots[selected];
  return (
    <>
      <div className="chart-info">
        <span>
          {s
            ? `${timeLabel(s.start, zoneFor(day.area), day.prices.length !== 24)} – ${timeLabel(s.end + 1800000, zoneFor(day.area), day.prices.length !== 24)}`
            : "Precio por hora"}
        </span>
        <strong>
          {s
            ? s.price.toFixed(4).replace(".", ",")
            : `${lowest.toFixed(3).replace(".", ",")} – ${highest.toFixed(3).replace(".", ",")}`}{" "}
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
                    spread < 1e-10
                      ? "var(--medium)"
                      : slot.price <= cheap
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

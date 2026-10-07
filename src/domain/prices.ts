import { dayInstants, zoneFor } from "./time";
import type { Area, PriceDay } from "./types";
export function parseManual(
  text: string,
  date: string,
  area: Area,
  unit: "kwh" | "mwh",
): PriceDay {
  const tokens = text
    .trim()
    .split(/[;\s]+/)
    .filter(Boolean);
  const prices = tokens.map((t) =>
    /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(t)
      ? Number(t.replace(",", ".")) / (unit === "mwh" ? 1000 : 1)
      : NaN,
  );
  const count = dayInstants(date, zoneFor(area)).length / 2;
  if (
    prices.length !== count ||
    prices.some((p) => !Number.isFinite(p) || Math.abs(p) > 10)
  )
    throw new Error(
      `Introduce ${count} precios entre −10 y 10 €/kWh, separados por espacios, líneas o punto y coma.`,
    );
  return {
    date,
    area,
    prices,
    source: "manual",
    fetchedAt: new Date().toISOString(),
  };
}
export function parseOfficial(
  data: unknown,
  date: string,
  area: Area,
): PriceDay {
  if (
    !data ||
    typeof data !== "object" ||
    !("PVPC" in data) ||
    !Array.isArray(data.PVPC)
  )
    throw new Error("La fuente no devuelve precios PVPC.");
  const [year, month, day] = date.split("-");
  const rows = data.PVPC.filter(
    (r: Record<string, unknown>) => r.Dia === `${day}/${month}/${year}`,
  );
  const prices = rows.map((r: Record<string, unknown>) =>
    typeof r[area === "cym" ? "CYM" : "PCB"] === "string"
      ? Number(
          (r[area === "cym" ? "CYM" : "PCB"] as string).replace(",", "."),
        ) / 1000
      : NaN,
  );
  const expected = dayInstants(date, "Europe/Madrid").length / 2;
  if (
    prices.length !== expected ||
    prices.some((p) => !Number.isFinite(p) || Math.abs(p) > 10)
  )
    throw new Error(
      "Los precios oficiales todavía no están disponibles o están incompletos.",
    );
  // Canary days are shifted one real hour from the published Madrid day.
  // The proxy stitches adjacent dates for this area before constructing a PriceDay.
  return {
    date,
    area,
    prices,
    source: "ree",
    fetchedAt: new Date().toISOString(),
  };
}

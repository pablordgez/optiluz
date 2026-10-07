import { parseOfficial } from "../src/domain/prices";
import {
  buildSlots,
  dateKey,
  dayInstants,
  shiftDate,
  zoneFor,
} from "../src/domain/time";
import type { Area, PriceDay } from "../src/domain/types";
export const SOURCE_URL = "https://api.esios.ree.es/archives/70/download_json";
const cache = new Map<string, { day: PriceDay; expires: number }>();
const inflight = new Map<string, Promise<PriceDay>>();
async function madridDay(date: string, area: Area): Promise<PriceDay> {
  const key = `${date}:${area}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.day;
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const response = await fetch(`${SOURCE_URL}?locale=es&date=${date}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok)
      throw new Error(
        "No se pudo consultar Red Eléctrica. Inténtalo más tarde o importa los precios.",
      );
    const day = parseOfficial(await response.json(), date, area);
    cache.set(key, { day, expires: Date.now() + 15 * 60000 });
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    return day;
  })();
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
export async function fetchPrices(date: string, area: Area): Promise<PriceDay> {
  const today = dateKey(Date.now(), zoneFor(area));
  dayInstants(date, zoneFor(area));
  if (date < shiftDate(today, -31) || date > shiftDate(today, 1))
    throw new Error("Fecha fuera del intervalo disponible.");
  if (area !== "canarias") return madridDay(date, area);
  const [first, next] = await Promise.all([
    madridDay(date, "pcb"),
    madridDay(shiftDate(date, 1), "pcb"),
  ]);
  const source = [...buildSlots(first), ...buildSlots(next)];
  const starts = dayInstants(date, "Atlantic/Canary").filter(
    (_, i) => i % 2 === 0,
  );
  const prices = starts.map((t) => source.find((s) => s.start === t)?.price);
  if (prices.some((v) => v === undefined))
    throw new Error("Faltan precios para completar el día de Canarias.");
  return {
    date,
    area,
    prices: prices as number[],
    source: "ree",
    fetchedAt: new Date().toISOString(),
  };
}

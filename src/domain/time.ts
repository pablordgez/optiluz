import type { Area, PriceDay, Slot } from "./types";
export const zoneFor = (area: Area) =>
  area === "canarias" ? "Atlantic/Canary" : "Europe/Madrid";
export function dateKey(time = Date.now(), zone = "Europe/Madrid"): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(time);
  return `${p.find((v) => v.type === "year")!.value}-${p.find((v) => v.type === "month")!.value}-${p.find((v) => v.type === "day")!.value}`;
}
export const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export function clockMinute(time: number, zone: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(time);
  return (
    Number(p.find((v) => v.type === "hour")!.value) * 60 +
    Number(p.find((v) => v.type === "minute")!.value)
  );
}
export function dayInstants(date: string, zone: string): number[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error("Fecha no válida.");
  const midday = Date.parse(`${date}T12:00:00Z`);
  const instants: number[] = [];
  for (let t = midday - 18 * 3600000; t < midday + 18 * 3600000; t += 1800000)
    if (dateKey(t, zone) === date) instants.push(t);
  return instants;
}
export function timeLabel(time: number, zone: string, offset = false) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(offset ? { timeZoneName: "shortOffset" as const } : {}),
  }).format(time);
}
export function buildSlots(day: PriceDay): Slot[] {
  const zone = zoneFor(day.area);
  const starts = dayInstants(day.date, zone);
  if (
    day.prices.length !== starts.length / 2 ||
    day.prices.some((p) => !Number.isFinite(p))
  )
    throw new Error(
      `Se necesitan ${starts.length / 2} precios válidos para esta fecha.`,
    );
  return starts.map((start, i) => ({
    start,
    end: start + 1800000,
    minute: clockMinute(start, zone),
    label: timeLabel(start, zone, starts.length !== 48),
    price: day.prices[Math.floor(i / 2)],
  }));
}
export const minuteLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

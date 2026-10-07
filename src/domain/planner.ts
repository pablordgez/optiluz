import type { LegacyHighs } from "highs";
import { buildSlots, timeLabel, zoneFor, clockMinute } from "./time";
import type { Task, PriceDay, Slot, Plan, Segment } from "./types";
export interface Candidate {
  name: string;
  taskIndex: number;
  slots: number[];
  cost: number;
}
export function validateTask(t: Task) {
  if (
    !t.name.trim() ||
    t.name.length > 60 ||
    !Number.isFinite(t.power) ||
    t.power < 0.05 ||
    t.power > 15 ||
    !Number.isInteger(t.duration / 30) ||
    t.duration < 30 ||
    t.duration > 1440 ||
    [t.earliest, t.latest, t.deadline, t.usual].some(
      (v) => !Number.isFinite(v) || v % 30 !== 0 || v < 0 || v > 1440,
    ) ||
    t.usual === 1440 ||
    t.earliest >= Math.min(t.latest, t.deadline)
  )
    throw new Error(
      `Revisa la duración, potencia y ventana de ${t.name || "la tarea"}.`,
    );
}
export function candidatesFor(t: Task, slots: Slot[], now: number): number[][] {
  validateTask(t);
  const n = t.duration / 30;
  const allowed = slots
    .map((s, i) =>
      s.start >= now &&
      s.minute >= t.earliest &&
      s.minute < Math.min(t.latest, t.deadline)
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  if (t.interruptible) return allowed.map((i) => [i]);
  const set = new Set(allowed);
  return allowed
    .map((i) => Array.from({ length: n }, (_, k) => i + k))
    .filter((a) => a.every((i) => set.has(i)));
}
const expression = (terms: { name: string; value: number }[]) =>
  terms
    .map(
      (t) =>
        `${t.value < 0 ? "-" : "+"} ${Math.abs(t.value).toFixed(10)} ${t.name}`,
    )
    .join(" ");
export function buildModel(
  tasks: Task[],
  day: PriceDay,
  maxPower: number,
  now = Date.now(),
) {
  if (!Number.isFinite(maxPower) || maxPower < 0.05 || maxPower > 30)
    throw new Error("El límite de potencia debe estar entre 0,05 y 30 kW.");
  if (
    !tasks.length ||
    tasks.length > 5 ||
    new Set(tasks.map((t) => t.id)).size !== tasks.length
  )
    throw new Error("Selecciona entre una y cinco tareas distintas.");
  const slots = buildSlots(day);
  const candidates: Candidate[] = [];
  const equations: string[] = [];
  tasks.forEach((t, taskIndex) => {
    if (t.power > maxPower)
      throw new Error(`${t.name} supera el límite de ${maxPower} kW.`);
    const options = candidatesFor(t, slots, now);
    if (
      !options.length ||
      (t.interruptible && options.length < t.duration / 30)
    )
      throw new Error(
        `${t.name} no cabe en su ventana. Amplía el plazo o reduce la duración.`,
      );
    const vars = options.map((s, i) => ({
      name: `x${taskIndex}_${i}`,
      taskIndex,
      slots: s,
      cost: s.reduce((sum, j) => sum + slots[j].price * t.power * 0.5, 0),
    }));
    candidates.push(...vars);
    equations.push(
      `task${taskIndex}: ${expression(vars.map((v) => ({ name: v.name, value: 1 })))} = ${t.interruptible ? t.duration / 30 : 1}`,
    );
  });
  slots.forEach((_, i) => {
    const terms = candidates
      .filter((c) => c.slots.includes(i))
      .map((c) => ({ name: c.name, value: tasks[c.taskIndex].power }));
    if (terms.length)
      equations.push(`power${i}: ${expression(terms)} <= ${maxPower}`);
  });
  const lp = `Minimize\n cost: ${expression(candidates.map((c) => ({ name: c.name, value: c.cost })))}\nSubject To\n ${equations.join("\n ")}\nBinary\n ${candidates.map((c) => c.name).join(" ")}\nEnd`;
  return { lp, candidates, slots };
}
export function mergeSegments(indices: number[], slots: Slot[]): Segment[] {
  const segments: Segment[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const prev = segments.at(-1);
    if (prev && prev.end === slots[i].start) prev.end = slots[i].end;
    else segments.push({ start: slots[i].start, end: slots[i].end });
  }
  return segments;
}
export function optimize(
  highs: LegacyHighs,
  tasks: Task[],
  day: PriceDay,
  maxPower: number,
  now = Date.now(),
): Plan {
  const { lp, candidates, slots } = buildModel(tasks, day, maxPower, now);
  const result = highs.solve(lp, {
    output_flag: false,
    time_limit: 8,
    mip_rel_gap: 0,
  });
  if (result.Status === "Infeasible")
    throw new Error(
      "No cabe un plan conjunto. Amplía las ventanas o el límite de potencia.",
    );
  if (!result.Columns)
    throw new Error(
      "No se ha encontrado un plan válido. Ajusta las ventanas y vuelve a calcular.",
    );
  const load = slots.map(() => 0);
  const planned = tasks.map((t, ti) => {
    const chosen = candidates.filter(
      (c) => c.taskIndex === ti && result.Columns[c.name]?.Primal > 0.5,
    );
    const indices = chosen.flatMap((c) => c.slots).sort((a, b) => a - b);
    if (
      indices.length !== t.duration / 30 ||
      new Set(indices).size !== indices.length ||
      (!t.interruptible &&
        indices.some((v, i) => i > 0 && v !== indices[i - 1] + 1))
    )
      throw new Error(
        "No se ha encontrado un plan válido dentro del tiempo de cálculo.",
      );
    indices.forEach((i) => {
      load[i] += t.power;
    });
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      color: t.color,
      power: t.power,
      cost: chosen.reduce((s, c) => s + c.cost, 0),
      segments: mergeSegments(indices, slots),
    };
  });
  if (load.some((p) => p > maxPower + 1e-6))
    throw new Error("El resultado supera el límite de potencia.");
  let usualCost: number | null = 0;
  for (const t of tasks) {
    const start = slots.findIndex(
      (s) => clockMinute(s.start, zoneFor(day.area)) === t.usual,
    );
    if (start < 0 || start + t.duration / 30 > slots.length) {
      usualCost = null;
      break;
    }
    usualCost += slots
      .slice(start, start + t.duration / 30)
      .reduce((s, v) => s + v.price * t.power * 0.5, 0);
  }
  return {
    date: day.date,
    zone: zoneFor(day.area),
    source: day.source,
    tasks: planned.sort((a, b) => a.segments[0].start - b.segments[0].start),
    cost: planned.reduce((s, t) => s + t.cost, 0),
    usualCost,
    peakPower: Math.max(...load),
    optimal: result.Status === "Optimal",
    generatedAt: new Date().toISOString(),
  };
}
export const segmentLabel = (s: Segment, zone: string) =>
  `${timeLabel(s.start, zone, true)} – ${timeLabel(s.end, zone, true)}`;

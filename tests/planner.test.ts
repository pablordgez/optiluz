import { beforeAll, describe, expect, it } from "vitest";
import loadHighs, { type LegacyHighs } from "highs";
import { buildModel, optimize } from "../src/domain/planner";
import { buildSlots, dayInstants, clockMinute } from "../src/domain/time";
import { templates, type PriceDay, type Task } from "../src/domain/types";
let solver: LegacyHighs;
beforeAll(async () => {
  solver = await loadHighs();
});
const day = (prices = Array(24).fill(0.2), date = "2026-10-07"): PriceDay => ({
  date,
  prices,
  area: "pcb",
  source: "manual",
  fetchedAt: new Date().toISOString(),
});
const task = (overrides: Partial<Task> = {}): Task => ({
  ...templates[0],
  id: "a",
  earliest: 0,
  latest: 1440,
  deadline: 1440,
  duration: 60,
  power: 1,
  usual: 600,
  ...overrides,
});
describe("joint optimizer", () => {
  it("prefers fewer interruptions at the same minimum cost", () => {
    const p = Array(24).fill(0.2);
    for (let i = 12; i < 17; i++) p[i] = 0.05;
    const plan = optimize(
      solver,
      templates.slice(0, 3).map((t, i) => ({ ...t, id: String(i) })),
      day(p),
      3.45,
      0,
    );
    expect(plan.cost).toBeCloseTo(0.375);
    expect(plan.tasks.find((t) => t.kind === "heater")!.segments).toHaveLength(
      1,
    );
  });
  it("selects the cheapest continuous window, including half-hour starts", () => {
    const p = Array(24).fill(0.5);
    p[10] = 0.1;
    p[11] = 0.15;
    const plan = optimize(solver, [task({ duration: 90 })], day(p), 2, 0);
    expect(plan.cost).toBeCloseTo(0.175);
    expect(plan.optimal).toBe(true);
    expect(plan.tasks[0].segments).toHaveLength(1);
    expect(
      plan.tasks[0].segments[0].end - plan.tasks[0].segments[0].start,
    ).toBe(90 * 60000);
  });
  it("moves conflicting loads and enforces the combined power ceiling", () => {
    const p = Array(24).fill(0.5);
    p[10] = 0.01;
    p[11] = 0.1;
    const plan = optimize(solver, [task(), task({ id: "b" })], day(p), 1, 0);
    expect(plan.peakPower).toBe(1);
    expect(plan.cost).toBeCloseTo(0.11);
    const slots = buildSlots(day(p));
    for (const slot of slots)
      expect(
        plan.tasks.reduce(
          (sum, t) =>
            sum +
            (t.segments.some((s) => s.start <= slot.start && s.end > slot.start)
              ? t.power
              : 0),
          0,
        ),
      ).toBeLessThanOrEqual(1);
  });
  it("splits interruptible loads into the cheapest disjoint slots", () => {
    const p = Array(24).fill(1);
    p[4] = -0.1;
    p[19] = 0.02;
    const plan = optimize(
      solver,
      [task({ duration: 120, interruptible: true })],
      day(p),
      1,
      0,
    );
    expect(plan.tasks[0].segments).toHaveLength(2);
    expect(plan.cost).toBeCloseTo(-0.08);
  });
  it("respects availability, deadline and the current real instant", () => {
    const d = day();
    const slots = buildSlots(d);
    const now = slots[19].start + 60000;
    const plan = optimize(
      solver,
      [task({ earliest: 480, latest: 1200, deadline: 660 })],
      d,
      2,
      now,
    );
    expect(plan.tasks[0].segments[0].start).toBeGreaterThanOrEqual(now);
    expect(
      clockMinute(plan.tasks[0].segments.at(-1)!.end, plan.zone),
    ).toBeLessThanOrEqual(660);
  });
  it("reports infeasible overlapping windows without dropping a task", () => {
    expect(() =>
      optimize(
        solver,
        [
          task({ earliest: 600, latest: 660, deadline: 660 }),
          task({ id: "b", earliest: 600, latest: 660, deadline: 660 }),
        ],
        day(),
        1,
        0,
      ),
    ).toThrow("No cabe un plan conjunto");
  });
  it("rejects overpowered tasks, missing prices and invalid durations", () => {
    expect(() => buildModel([task({ power: 3 })], day(), 2, 0)).toThrow(
      "supera",
    );
    expect(() => buildModel([task()], day([0.2]), 2, 0)).toThrow("24 precios");
    expect(() => buildModel([task({ duration: 45 })], day(), 2, 0)).toThrow(
      "Revisa",
    );
  });
  it("handles both repeated and skipped hours using real elapsed durations", () => {
    for (const [date, hours] of [
      ["2026-03-29", 23],
      ["2026-10-25", 25],
    ] as const) {
      const d = day(Array(hours).fill(0.1), date);
      const plan = optimize(solver, [task({ duration: 180 })], d, 2, 0);
      expect(plan.cost).toBeCloseTo(0.3);
      expect(
        plan.tasks[0].segments[0].end - plan.tasks[0].segments[0].start,
      ).toBe(180 * 60000);
      expect(dayInstants(date, "Europe/Madrid")).toHaveLength(hours * 2);
    }
  });
  it("matches exhaustive joint search on a small instance", () => {
    const p = Array.from({ length: 24 }, (_, i) => ((i * 7) % 13) / 100);
    const a = task({ duration: 60, earliest: 600, latest: 780, deadline: 780 });
    const b = task({
      id: "b",
      duration: 90,
      power: 0.5,
      earliest: 600,
      latest: 780,
      deadline: 780,
    });
    const d = day(p);
    const { candidates } = buildModel([a, b], d, 1, 0);
    let best = Infinity;
    for (const x of candidates.filter((c) => c.taskIndex === 0))
      for (const y of candidates.filter((c) => c.taskIndex === 1))
        if (!x.slots.some((i) => y.slots.includes(i)))
          best = Math.min(best, x.cost + y.cost);
    expect(optimize(solver, [a, b], d, 1, 0).cost).toBeCloseTo(best);
  });
  it("does not claim a comparison when a habitual cycle crosses midnight", () => {
    expect(
      optimize(solver, [task({ usual: 1410, duration: 120 })], day(), 2, 0)
        .usualCost,
    ).toBeNull();
  });
  it("allows five mixed loads and conserves each task duration", () => {
    const tasks = templates.map((t, i) => ({ ...t, id: String(i) }));
    const plan = optimize(solver, tasks, day(), 3.45, 0);
    expect(plan.tasks).toHaveLength(5);
    expect(plan.peakPower).toBeLessThanOrEqual(3.45);
    for (const t of tasks)
      expect(
        plan.tasks
          .find((p) => p.id === t.id)!
          .segments.reduce((sum, s) => sum + (s.end - s.start), 0),
      ).toBe(t.duration * 60000);
  });
});

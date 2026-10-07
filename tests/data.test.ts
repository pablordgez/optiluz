import { describe, it, expect } from "vitest";
import { parseManual, parseOfficial } from "../src/domain/prices";
import { dateKey, dayInstants, shiftDate, timeLabel } from "../src/domain/time";
import { calendar, readSharedPlan } from "../src/share";
import type { Plan } from "../src/domain/types";
describe("price ingestion", () => {
  it("rejects blank official values rather than treating them as zero", () => {
    const data = {
      PVPC: Array(24).fill({ Dia: "07/10/2026", PCB: "", CYM: "100" }),
    };
    expect(() => parseOfficial(data, "2026-10-07", "pcb")).toThrow(
      "incompletos",
    );
  });
  it("accepts decimal commas, negatives and explicit MWh conversion", () => {
    const day = parseManual(
      Array(24).fill("-10,5").join(";\n"),
      "2026-10-07",
      "pcb",
      "mwh",
    );
    expect(day.prices[0]).toBe(-0.0105);
  });
  it("rejects missing values, ambiguous commas and nonnumeric values", () => {
    for (const text of [
      "0.1 0.2",
      Array(24).fill("NaN").join("\n"),
      Array(24).fill("0,1,0,2").join(";"),
    ])
      expect(() => parseManual(text, "2026-10-07", "pcb", "kwh")).toThrow(
        "24 precios",
      );
  });
  it("expects 23 or 25 prices on DST dates", () => {
    expect(
      parseManual(Array(23).fill("0.1").join("\n"), "2026-03-29", "pcb", "kwh")
        .prices,
    ).toHaveLength(23);
    expect(() =>
      parseManual(Array(24).fill("0.1").join("\n"), "2026-10-25", "pcb", "kwh"),
    ).toThrow("25 precios");
  });
  it("selects the official region and refuses another date", () => {
    const data = {
      PVPC: Array.from({ length: 24 }, (_, i) => ({
        Dia: "07/10/2026",
        Hora: `${String(i).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
        PCB: "100,5",
        CYM: "150,5",
      })),
    };
    expect(parseOfficial(data, "2026-10-07", "pcb").prices[0]).toBe(0.1005);
    expect(parseOfficial(data, "2026-10-07", "cym").prices[0]).toBe(0.1505);
    expect(() => parseOfficial(data, "2026-10-08", "pcb")).toThrow(
      "no están disponibles",
    );
  });
});
describe("time and sharing", () => {
  it("uses household timezone around midnight and calendar year boundaries", () => {
    expect(dateKey(Date.parse("2026-10-06T22:30:00Z"), "Europe/Madrid")).toBe(
      "2026-10-07",
    );
    expect(dateKey(Date.parse("2026-10-06T22:30:00Z"), "Atlantic/Canary")).toBe(
      "2026-10-06",
    );
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("labels repeated hours with different offsets", () => {
    const starts = dayInstants("2026-10-25", "Europe/Madrid");
    const repeated = starts.filter(
      (t) => timeLabel(t, "Europe/Madrid") === "02:00",
    );
    expect(repeated).toHaveLength(2);
    expect(timeLabel(repeated[0], "Europe/Madrid", true)).not.toBe(
      timeLabel(repeated[1], "Europe/Madrid", true),
    );
  });
  const plan: Plan = {
    date: "2026-10-07",
    zone: "Europe/Madrid",
    source: "manual",
    cost: 0.2,
    usualCost: 0.3,
    peakPower: 1,
    optimal: true,
    generatedAt: "2026-10-06T18:00:00Z",
    tasks: [
      {
        id: "a",
        name: "Lavadora; mañana",
        kind: "washer",
        color: "#4f81e8",
        power: 1,
        cost: 0.2,
        segments: [
          {
            start: Date.parse("2026-10-07T10:00:00Z"),
            end: Date.parse("2026-10-07T11:00:00Z"),
          },
        ],
      },
    ],
  };
  it("generates UTC calendar events with escaped titles and alarms", () => {
    const text = calendar(plan);
    expect(text).toContain("DTSTART:20261007T100000Z");
    expect(text).toContain("SUMMARY:Lavadora\\; mañana");
    expect(text).toContain("TRIGGER:-PT5M");
    expect(text.endsWith("\r\n")).toBe(true);
  });
  it("accepts unicode plans and validates untrusted shared data", () => {
    const encoded = (p: unknown) =>
      "#plan=" +
      encodeURIComponent(Buffer.from(JSON.stringify(p)).toString("base64"));
    expect(readSharedPlan(encoded(plan))?.tasks[0].name).toBe(
      "Lavadora; mañana",
    );
    expect(() => readSharedPlan(encoded({ ...plan, zone: "wrong" }))).toThrow();
    expect(() =>
      readSharedPlan(
        encoded({ ...plan, tasks: [{ ...plan.tasks[0], color: "url(evil)" }] }),
      ),
    ).toThrow();
  });
});

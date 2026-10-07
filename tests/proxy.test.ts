import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrices, SOURCE_URL } from "../server/prices";
const official = (date: string) => ({
  PVPC: Array.from({ length: 24 }, (_, i) => ({
    Dia: date.split("-").reverse().join("/"),
    Hora: `${i}-${i + 1}`,
    PCB: String(100 + i),
    CYM: String(200 + i),
  })),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("official proxy", () => {
  it("deduplicates concurrent requests and reuses a bounded-lived cache", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(official("2026-10-04"))));
    const [a, b] = await Promise.all([
      fetchPrices("2026-10-04", "pcb"),
      fetchPrices("2026-10-04", "pcb"),
    ]);
    expect(a).toEqual(b);
    expect(request).toHaveBeenCalledTimes(1);
    await fetchPrices("2026-10-04", "pcb");
    expect(request).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16 * 60000);
    request.mockResolvedValue(
      new Response(JSON.stringify(official("2026-10-04"))),
    );
    await fetchPrices("2026-10-04", "pcb");
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0][0])).toBe(
      `${SOURCE_URL}?locale=es&date=2026-10-04`,
    );
  });
  it("preserves the official PCB hourly order in local Canary time", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(official("2026-10-05"))));
    const data = await fetchPrices("2026-10-05", "canarias");
    expect(data.area).toBe("canarias");
    expect(data.prices[0]).toBe(0.1);
    expect(data.prices[23]).toBe(0.123);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not cache unavailable data and succeeds on a later retry", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ PVPC: [] })));
    await expect(fetchPrices("2026-10-06", "cym")).rejects.toThrow(
      "incompletos",
    );
    request.mockResolvedValue(
      new Response(JSON.stringify(official("2026-10-06"))),
    );
    expect((await fetchPrices("2026-10-06", "cym")).prices[0]).toBe(0.2);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects invalid dates before any upstream request", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    for (const date of ["2026-02-30", "2026-01-01", "2026-10-09", "nonsense"])
      await expect(fetchPrices(date, "pcb")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("reports an upstream failure without returning generated prices", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 503 }),
    );
    await expect(fetchPrices("2026-10-03", "pcb")).rejects.toThrow(
      "No se pudo consultar",
    );
  });
});

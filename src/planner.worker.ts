import loadHighs from "highs";
import wasmUrl from "highs/runtime?url";
import { optimize } from "./domain/planner";
import type { Task, PriceDay } from "./domain/types";
let solver: ReturnType<typeof loadHighs> | undefined;
self.onmessage = async (
  event: MessageEvent<{
    tasks: Task[];
    day: PriceDay;
    maxPower: number;
    now: number;
  }>,
) => {
  try {
    solver ??= loadHighs({ locateFile: () => wasmUrl });
    const highs = await solver;
    const { tasks, day, maxPower, now } = event.data;
    self.postMessage({ plan: optimize(highs, tasks, day, maxPower, now) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "No se pudo calcular el plan.",
    });
  }
};

import express from "express";
import { resolve } from "node:path";
import { fetchPrices } from "./prices";
import type { Area } from "../src/domain/types";
const app = express();
app.disable("x-powered-by");
app.get("/api/prices", async (req, res) => {
  const { date, area = "pcb" } = req.query;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["pcb", "canarias", "cym"].includes(String(area))
  ) {
    res.status(400).json({ error: "Fecha o zona no válida." });
    return;
  }
  try {
    res
      .set("Cache-Control", "public, max-age=300")
      .json(await fetchPrices(date, area as Area));
  } catch (error) {
    res
      .status(503)
      .json({
        error:
          error instanceof Error ? error.message : "Precios no disponibles.",
      });
  }
});
app.use("/api", (_, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_, res) => {
  res.sendFile(resolve("dist/index.html"));
});
app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () => {
  console.log(`OptiLuz: http://127.0.0.1:${process.env.PORT ?? 3001}`);
});

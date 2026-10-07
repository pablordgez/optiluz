import type { Plan } from "./domain/types";
import { dateKey, timeLabel } from "./domain/time";
import { segmentLabel } from "./domain/planner";
export const money = (value: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value);
export function planText(plan: Plan) {
  return [
    `OptiLuz · ${plan.date}`,
    ...plan.tasks.flatMap((t) => [
      `${t.name}: ${t.segments.map((s) => segmentLabel(s, plan.zone)).join(", ")} · ${money(t.cost)}`,
    ]),
    `Coste estimado: ${money(plan.cost)} · Potencia máxima: ${plan.peakPower.toFixed(2)} kW`,
    `Precios ${plan.source === "ree" ? "PVPC REE sin impuestos" : "importados"}. Consumo medio estimado.`,
  ].join("\n");
}
export function shareLink(plan: Plan) {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  const encoded = btoa(
    Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
  );
  return `${location.origin}${location.pathname}#plan=${encodeURIComponent(encoded)}`;
}
export function readSharedPlan(hash: string): Plan | null {
  if (!hash.startsWith("#plan=")) return null;
  if (hash.length > 30000) throw new Error("El enlace es demasiado largo.");
  const raw = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(decodeURIComponent(hash.slice(6))), (c) =>
        c.charCodeAt(0),
      ),
    ),
  ) as Plan;
  if (
    !raw ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
    !["Europe/Madrid", "Atlantic/Canary"].includes(raw.zone) ||
    !["ree", "manual"].includes(raw.source) ||
    !Array.isArray(raw.tasks) ||
    !raw.tasks.length ||
    raw.tasks.length > 5 ||
    [raw.cost, raw.peakPower].some((v) => !Number.isFinite(v)) ||
    (raw.usualCost !== null && !Number.isFinite(raw.usualCost))
  )
    throw new Error("Enlace de plan no válido.");
  for (const t of raw.tasks) {
    if (
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      t.name.length > 60 ||
      typeof t.kind !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(t.color) ||
      !Number.isFinite(t.power) ||
      !Number.isFinite(t.cost) ||
      !Array.isArray(t.segments) ||
      !t.segments.length ||
      t.segments.length > 50 ||
      t.segments.some(
        (s) =>
          !Number.isFinite(s.start) ||
          !Number.isFinite(s.end) ||
          s.end <= s.start ||
          s.end - s.start > 25 * 3600000 ||
          dateKey(s.start, raw.zone) !== raw.date,
      )
    )
      throw new Error("Enlace de plan no válido.");
  }
  return raw;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const utc = (time: number) =>
  new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escapeICS = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export function calendar(plan: Plan) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OptiLuz//Plan doméstico//ES",
    "CALSCALE:GREGORIAN",
  ];
  plan.tasks.forEach((t) =>
    t.segments.forEach((s, i) =>
      lines.push(
        "BEGIN:VEVENT",
        `UID:${plan.date}-${t.id.replace(/[^a-zA-Z0-9-]/g, "")}-${i}@optiluz.local`,
        `DTSTAMP:${utc(Date.now())}`,
        `DTSTART:${utc(s.start)}`,
        `DTEND:${utc(s.end)}`,
        `SUMMARY:${escapeICS(t.name)}`,
        `DESCRIPTION:${escapeICS(`OptiLuz. Coste total de la tarea: ${money(t.cost)}. Potencia: ${t.power} kW.`)}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT5M",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeICS(t.name)}`,
        "END:VALARM",
        "END:VEVENT",
      ),
    ),
  );
  lines.push("END:VCALENDAR");
  // RFC 5545 folding counts UTF-8 octets, rather than UTF-16 characters.
  return (
    lines
      .map((line) => {
        let result = "";
        let length = 0;
        for (const c of line) {
          const n = new TextEncoder().encode(c).length;
          if (length + n > 73) {
            result += "\r\n ";
            length = 1;
          }
          result += c;
          length += n;
        }
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}
export async function planImage(plan: Plan) {
  const canvas = document.createElement("canvas");
  const lines = plan.tasks.flatMap((t) =>
    t.segments.map((s) => ({
      name: t.name,
      time: `${timeLabel(s.start, plan.zone, true)} – ${timeLabel(s.end, plan.zone, true)}`,
      color: t.color,
    })),
  );
  canvas.width = 1000;
  canvas.height = 290 + lines.length * 90;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#151515";
  c.font = "bold 44px sans-serif";
  c.fillText("OptiLuz", 50, 70);
  c.font = "26px sans-serif";
  c.fillText(plan.date, 50, 120);
  lines.forEach((line, i) => {
    const y = 180 + i * 90;
    c.fillStyle = line.color;
    c.fillRect(50, y - 30, 8, 55);
    c.fillStyle = "#151515";
    c.font = "bold 26px sans-serif";
    let name = line.name;
    while (c.measureText(name).width > 400) name = name.slice(0, -2) + "…";
    c.fillText(name, 80, y);
    c.font = "24px sans-serif";
    c.fillText(line.time, 510, y);
  });
  c.fillStyle = "#151515";
  c.font = "bold 28px sans-serif";
  c.fillText(`Coste estimado: ${money(plan.cost)}`, 50, canvas.height - 75);
  c.fillStyle = "#555";
  c.font = "20px sans-serif";
  c.fillText(
    `Precios ${plan.source === "ree" ? "PVPC REE sin impuestos" : "importados"} · Consumo medio estimado`,
    50,
    canvas.height - 35,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo crear la imagen.")),
      "image/png",
    ),
  );
  download(blob, `optiluz-${plan.date}.png`);
}

import {
  CalendarDays,
  Check,
  Download,
  Image,
  Link,
  Bell,
  Copy,
} from "lucide-react";
import type { Plan } from "../domain/types";
import {
  money,
  calendar,
  download,
  planImage,
  planText,
  shareLink,
} from "../share";
import { segmentLabel } from "../domain/planner";
import { timeLabel, dayInstants } from "../domain/time";
import { TaskIcon } from "./TaskIcon";
export function PlanView({
  plan,
  reminders,
  onReminders,
  onFeedback,
  shared = false,
}: {
  plan: Plan;
  reminders: boolean;
  onReminders: () => void;
  onFeedback: (message: string, error?: boolean) => void;
  shared?: boolean;
}) {
  const saving = plan.usualCost === null ? null : plan.usualCost - plan.cost;
  const starts = dayInstants(plan.date, plan.zone);
  const dayStart = starts[0],
    dayLength = starts.length * 1800000;
  const action = async (
    fn: () => Promise<unknown> | unknown,
    message?: string,
  ) => {
    try {
      await fn();
      if (message) onFeedback(message);
    } catch (err) {
      onFeedback(
        err instanceof Error ? err.message : "No se pudo completar la acción.",
        true,
      );
    }
  };
  return (
    <>
      <div className="plan-stats">
        <div>
          <span>Coste estimado</span>
          <strong>{money(plan.cost)}</strong>
        </div>
        <div>
          <span>
            {saving !== null && saving < -0.0001
              ? "Diferencia con habitual"
              : "Ahorro vs. habitual"}
          </span>
          <strong className={saving !== null && saving >= 0 ? "saving" : ""}>
            {saving === null ? "—" : money(saving)}
          </strong>
        </div>
      </div>
      <div className="timeline">
        {plan.tasks.map((task) => (
          <article className="scheduled-task" key={task.id}>
            <div
              className="task-symbol"
              style={{ color: task.color, background: `${task.color}18` }}
            >
              <TaskIcon kind={task.kind} />
            </div>
            <div className="scheduled-content">
              <div className="row-between">
                <strong>{task.name}</strong>
                <span className="task-cost">{money(task.cost)}</span>
              </div>
              {task.segments.map((s) => (
                <div className="time-range" key={s.start}>
                  {segmentLabel(s, plan.zone)}
                  {s.end <= Date.now() && (
                    <span className="done">
                      <Check size={12} />
                      Finalizada
                    </span>
                  )}
                </div>
              ))}
              <div className="timeline-track" aria-hidden="true">
                {task.segments.map((s) => (
                  <span
                    key={s.start}
                    style={{
                      background: task.color,
                      left: `${((s.start - dayStart) / dayLength) * 100}%`,
                      width: `${((s.end - s.start) / dayLength) * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="plan-meta">
        <span>
          Máximo simultáneo{" "}
          <b>{plan.peakPower.toFixed(2).replace(".", ",")} kW</b>
        </span>
        <span>{plan.optimal ? "Coste mínimo" : "Mejor plan encontrado"}</span>
      </div>
      {plan.usualCost !== null && (
        <p className="field-help">Horario habitual: {money(plan.usualCost)}</p>
      )}
      <p className="field-help">
        Consumo medio estimado ·{" "}
        {plan.source === "ree" ? "PVPC sin impuestos" : "Precios importados"}
      </p>
      <div className="plan-actions">
        {!shared && (
          <button
            className={reminders ? "reminder-active" : ""}
            onClick={onReminders}
          >
            <Bell size={16} />
            {reminders ? "Avisos activos" : "Recordatorios"}
          </button>
        )}
        <button
          onClick={() =>
            action(() => {
              download(
                new Blob([calendar(plan)], {
                  type: "text/calendar;charset=utf-8",
                }),
                `optiluz-${plan.date}.ics`,
              );
            }, "Calendario descargado. Incluye avisos 5 minutos antes.")
          }
        >
          <CalendarDays size={16} />
          Calendario
        </button>
        <button onClick={() => action(() => planImage(plan))}>
          <Image size={16} />
          Imagen
        </button>
        <button
          onClick={() =>
            action(
              () => navigator.clipboard.writeText(planText(plan)),
              "Horario copiado.",
            )
          }
        >
          <Copy size={16} />
          Texto
        </button>
        {!shared && (
          <button
            onClick={() =>
              action(
                () => navigator.clipboard.writeText(shareLink(plan)),
                "Enlace copiado.",
              )
            }
          >
            <Link size={16} />
            Compartir
          </button>
        )}
      </div>
      {!shared && reminders && (
        <p className="field-help">
          Avisos al comenzar cada tramo, con la app abierta. Para recibirlos con
          la app cerrada, añade el calendario.
        </p>
      )}
      <span className="generated">
        Calculado a las {timeLabel(Date.parse(plan.generatedAt), plan.zone)}
      </span>
    </>
  );
}

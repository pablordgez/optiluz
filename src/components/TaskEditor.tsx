import { useState } from "react";
import type { Task } from "../domain/types";
import { minuteLabel } from "../domain/time";
import { validateTask } from "../domain/planner";
import { Modal } from "./Modal";
const times = Array.from({ length: 49 }, (_, i) => i * 30);
export function TaskEditor({
  task,
  onSave,
  onDelete,
  onClose,
}: {
  task: Task;
  onSave: (t: Task) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(task);
  const [mode, setMode] = useState<"power" | "energy">("power");
  const [error, setError] = useState("");
  const change = (key: keyof Task, value: string | number | boolean) =>
    setDraft((s) => ({ ...s, [key]: value }));
  const timeField = (
    name: string,
    key: "earliest" | "latest" | "deadline" | "usual",
  ) => (
    <label>
      {name}
      <select
        value={draft[key]}
        onChange={(e) => change(key, Number(e.target.value))}
      >
        {times
          .filter((v) =>
            key === "usual" || key === "earliest" ? v < 1440 : true,
          )
          .map((m) => (
            <option value={m} key={m}>
              {minuteLabel(m)}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <Modal title="Editar tarea" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateTask(draft);
            onSave({ ...draft, name: draft.name.trim() });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          Nombre
          <input
            autoFocus
            required
            maxLength={60}
            value={draft.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Duración
            <select
              value={draft.duration}
              onChange={(e) => {
                const duration = Number(e.target.value);
                setDraft((s) => ({
                  ...s,
                  duration,
                  power:
                    mode === "energy"
                      ? (s.power * s.duration) / duration
                      : s.power,
                }));
              }}
            >
              {Array.from({ length: 48 }, (_, i) => (i + 1) * 30).map((m) => (
                <option key={m} value={m}>
                  {m / 60} h
                </option>
              ))}
            </select>
          </label>
          <label>
            Indicar consumo
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="power">Potencia media · kW</option>
              <option value="energy">Energía del ciclo · kWh</option>
            </select>
          </label>
        </div>
        <label>
          {mode === "power" ? "Potencia media (kW)" : "Energía del ciclo (kWh)"}
          <input
            type="number"
            required
            min={mode === "power" ? 0.05 : 0.025}
            max={mode === "power" ? 15 : 360}
            step="any"
            value={
              mode === "power"
                ? draft.power
                : Number(((draft.power * draft.duration) / 60).toFixed(4))
            }
            onChange={(e) =>
              change(
                "power",
                Number(e.target.value) /
                  (mode === "power" ? 1 : draft.duration / 60),
              )
            }
          />
        </label>
        <div className="form-grid">
          {timeField("Disponible desde", "earliest")}
          {timeField("Disponible hasta", "latest")}
          {timeField("Terminar antes de", "deadline")}
          {timeField("Inicio habitual", "usual")}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.interruptible}
            onChange={(e) => change("interruptible", e.target.checked)}
          />
          Permitir interrupciones de 30 minutos
        </label>
        <p className="field-help">
          Ventanas dentro del mismo día. El consumo se distribuye uniformemente
          durante el ciclo.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="danger-button" onClick={onDelete}>
            Eliminar tarea
          </button>
          <button className="primary" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

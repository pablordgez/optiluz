import { useEffect, useRef, useState } from "react";
import {
  Zap,
  CalendarDays,
  ChartNoAxesColumn,
  Settings2,
  Plus,
  ArrowRight,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Download,
  Pencil,
  WifiOff,
  Check,
  X,
  LoaderCircle,
  Upload,
  CircleHelp,
} from "lucide-react";
import {
  initialState,
  templates,
  type State,
  type Task,
  type PriceDay,
  type Area,
  type Theme,
  type Plan,
} from "./domain/types";
import {
  dateKey,
  shiftDate,
  zoneFor,
  dayInstants,
  minuteLabel,
  timeLabel,
} from "./domain/time";
import { parseManual } from "./domain/prices";
import { loadState, saveState } from "./storage";
import { money, download, readSharedPlan } from "./share";
import { PriceChart } from "./components/PriceChart";
import { PlanView } from "./components/PlanView";
import { TaskEditor } from "./components/TaskEditor";
import { TaskIcon } from "./components/TaskIcon";
import { Modal } from "./components/Modal";
import { PowerLimit } from "./components/PowerLimit";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const keyFor = (date: string, s: State) =>
  `${date}:${s.settings.area}:${s.settings.tariff}`;
const invalidate = (s: State): State => ({ ...s, plans: {}, reminders: {} });
const sharedOnLoad = () => {
  try {
    return { plan: readSharedPlan(location.hash), error: "" };
  } catch {
    return { plan: null, error: "El enlace compartido no es válido." };
  }
};

export function App() {
  const [state, setState] = useState<State>(initialState);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<"plan" | "prices" | "settings">("plan");
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [fetching, setFetching] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [retry, setRetry] = useState(0);
  const [edit, setEdit] = useState<Task | null>(null);
  const [modal, setModal] = useState<
    "add" | "import" | "help" | "reset" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [shared, setShared] = useState(sharedOnLoad);
  const worker = useRef<Worker | null>(null);
  const notified = useRef(new Set<string>());
  const zone = zoneFor(state.settings.area);
  const today = dateKey(now, zone);
  const date = shiftDate(today, offset);
  const key = keyFor(date, state);
  const day = state.prices[key];
  const plan = state.plans[key];
  const active = state.tasks.filter((t) => t.enabled);
  const dark =
    state.settings.theme === "dark" ||
    (state.settings.theme === "system" && systemDark);
  const alertUser = (message: string, error = false) =>
    setFeedback({ message, error });

  useEffect(() => {
    let alive = true;
    loadState()
      .then((s) => {
        if (alive) {
          setState(s);
          notified.current = new Set(Object.keys(s.notified));
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) {
          setReady(true);
          alertUser(
            "No se puede acceder al almacenamiento local. Los cambios no se conservarán.",
            true,
          );
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready)
      saveState(state).catch(() =>
        alertUser(
          "No se han podido guardar los cambios en este dispositivo.",
          true,
        ),
      );
  }, [state, ready]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    const onOnline = () => {
        setOnline(true);
        setRetry((v) => v + 1);
      },
      onOffline = () => setOnline(false);
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    const onHash = () => setShared(sharedOnLoad());
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("hashchange", onHash);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("hashchange", onHash);
      worker.current?.terminate();
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      setSystemDark(media.matches);
      const theme =
        state.settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : state.settings.theme;
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#080808" : "#ffffff");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [state.settings.theme]);
  useEffect(() => {
    if (!ready || shared.plan) return;
    setPriceError("");
    if (state.settings.tariff === "manual") {
      setFetching(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);
    let alive = true;
    setFetching(true);
    fetch(`/api/prices?date=${date}&area=${state.settings.area}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Precios no disponibles.");
        const value = data as PriceDay;
        if (
          value.date !== date ||
          value.area !== state.settings.area ||
          value.source !== "ree" ||
          value.prices.length !== dayInstants(date, zone).length / 2 ||
          value.prices.some((p) => !Number.isFinite(p))
        )
          throw new Error("La fuente ha devuelto datos incompletos.");
        if (!alive) return;
        setState((s) => {
          const changed =
            s.prices[key] &&
            JSON.stringify(s.prices[key].prices) !==
              JSON.stringify(value.prices);
          const prices = { ...s.prices, [key]: value };
          Object.keys(prices)
            .filter((k) => k.slice(0, 10) < shiftDate(today, -31))
            .forEach((k) => delete prices[k]);
          const plans = { ...s.plans },
            reminders = { ...s.reminders };
          if (changed) {
            delete plans[key];
            delete reminders[key];
          }
          return { ...s, prices, plans, reminders };
        });
      })
      .catch((err) => {
        if (alive)
          setPriceError(
            err.name === "AbortError"
              ? "La consulta ha tardado demasiado. Reintenta o importa los precios."
              : navigator.onLine
                ? err instanceof TypeError || err instanceof SyntaxError
                  ? "No se pudieron consultar los precios. Reintenta o importa tu tarifa."
                  : err.message
                : "Sin conexión. Se usan los datos guardados, si están disponibles.",
          );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (alive) setFetching(false);
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [ready, key, retry, shared.plan]);
  useEffect(() => {
    if (
      !ready ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    for (const [planKey, enabled] of Object.entries(state.reminders)) {
      const p = state.plans[planKey];
      if (!enabled || !p) continue;
      for (const t of p.tasks)
        for (const segment of t.segments) {
          const id = `${planKey}:${t.id}:${segment.start}`;
          if (
            segment.start <= now &&
            now < segment.start + 60000 &&
            !notified.current.has(id)
          ) {
            notified.current.add(id);
            setState((s) => ({
              ...s,
              notified: { ...s.notified, [id]: true },
            }));
            const options = {
              body: `Inicio: ${timeLabel(segment.start, p.zone)} · ${t.power} kW`,
              icon: "/icon-192.png",
              tag: id,
            };
            navigator.serviceWorker
              ?.getRegistration()
              .then(async (reg) => {
                if (reg) await reg.showNotification(t.name, options);
                else new Notification(t.name, options);
              })
              .catch(() => alertUser(`Es hora de iniciar ${t.name}.`));
          }
        }
    }
  }, [state.plans, state.reminders, ready, now]);

  const updateTasks = (tasks: Task[]) =>
    setState((s) => invalidate({ ...s, tasks }));
  const changeSetting = (values: Partial<State["settings"]>) =>
    setState((s) =>
      "theme" in values
        ? { ...s, settings: { ...s.settings, ...values } }
        : invalidate({ ...s, settings: { ...s.settings, ...values } }),
    );
  const calculate = () => {
    if (!day || busy) return;
    setFeedback(null);
    setBusy(true);
    const w = new Worker(new URL("./planner.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const timeout = setTimeout(() => {
      w.terminate();
      setBusy(false);
      alertUser(
        "El cálculo ha tardado demasiado. Ajusta las ventanas y vuelve a intentarlo.",
        true,
      );
    }, 20000);
    const finish = () => {
      clearTimeout(timeout);
      w.terminate();
      worker.current = null;
      setBusy(false);
    };
    w.onmessage = (event: MessageEvent<{ plan?: Plan; error?: string }>) => {
      finish();
      if (event.data.error) alertUser(event.data.error, true);
      else if (event.data.plan)
        setState((s) => ({
          ...s,
          plans: { ...s.plans, [key]: event.data.plan! },
          reminders: { ...s.reminders, [key]: false },
        }));
    };
    w.onerror = () => {
      finish();
      alertUser(
        "No se pudo cargar el planificador. Recarga la aplicación.",
        true,
      );
    };
    w.postMessage({
      tasks: active,
      day,
      maxPower: state.settings.maxPower,
      now: Date.now(),
    });
  };
  const reminders = async () => {
    if (state.reminders[key]) {
      setState((s) => ({ ...s, reminders: { ...s.reminders, [key]: false } }));
      return;
    }
    if (!("Notification" in window)) {
      alertUser(
        "Este navegador no admite avisos locales. Usa el calendario.",
        true,
      );
      return;
    }
    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        alertUser(
          "Permite las notificaciones en el navegador o usa el calendario.",
          true,
        );
        return;
      }
      setState((s) => ({ ...s, reminders: { ...s.reminders, [key]: true } }));
    } catch {
      alertUser("No se pudieron activar los avisos. Usa el calendario.", true);
    }
  };

  if (!ready)
    return (
      <div className="loading-screen">
        <Zap />
        <span>OptiLuz</span>
        <LoaderCircle className="spin" size={18} />
      </div>
    );
  if (shared.plan)
    return (
      <div className="shared-shell">
        <header className="shared-header">
          <a className="brand" href={location.pathname}>
            <span className="brand-icon">
              <Zap size={23} fill="currentColor" />
            </span>
            OptiLuz
          </a>
          <span className="pill">Plan compartido</span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">Horario doméstico</span>
              <h1>
                {new Intl.DateTimeFormat("es-ES", {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(`${shared.plan.date}T12:00:00Z`))}
              </h1>
            </div>
          </div>
          <section className="panel">
            <PlanView
              plan={shared.plan}
              shared
              reminders={false}
              onReminders={() => {}}
              onFeedback={alertUser}
            />
          </section>
          <a className="button primary shared-open" href={location.pathname}>
            Abrir OptiLuz
            <ArrowRight size={16} />
          </a>
        </main>
        {feedback && (
          <Feedback value={feedback} close={() => setFeedback(null)} />
        )}
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          OptiLuz
        </a>
        <nav aria-label="Principal">
          {(
            [
              { id: "plan", label: "Mi plan", icon: CalendarDays },
              { id: "prices", label: "Precios", icon: ChartNoAxesColumn },
              { id: "settings", label: "Ajustes", icon: Settings2 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-current={page === item.id ? "page" : undefined}
              className={page === item.id ? "nav-active" : ""}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={19} />
              {item.label}
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {install && (
            <button
              onClick={async () => {
                await install.prompt();
                const choice = await install.userChoice;
                if (choice.outcome === "accepted") setInstall(null);
              }}
            >
              <Download size={17} />
              Instalar app
            </button>
          )}
          <button onClick={() => setModal("help")}>
            <CircleHelp size={17} />
            Ayuda
          </button>
          <div className="local-status">
            <i className={online ? "" : "offline-dot"} />
            {online ? "Guardado en este dispositivo" : "Sin conexión"}
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            {state.settings.tariff === "pvpc" ? "PVPC" : "Tarifa importada"}{" "}
            <span className="separator">/</span>{" "}
            {state.settings.area === "canarias"
              ? "Canarias"
              : state.settings.area === "cym"
                ? "Ceuta y Melilla"
                : "Península y Baleares"}
          </span>
          <button
            className="icon-button theme-shortcut"
            aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
            onClick={() =>
              changeSetting({
                theme: dark ? "light" : "dark",
              })
            }
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </header>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {page === "settings"
                ? "Preferencias del hogar"
                : new Intl.DateTimeFormat("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${date}T12:00:00Z`))}
            </span>
            <h1>
              {page === "plan"
                ? "Mi plan"
                : page === "prices"
                  ? "Precios de la luz"
                  : "Ajustes"}
            </h1>
          </div>
          {page !== "settings" && (
            <div className="segmented day-picker">
              {["Hoy", "Mañana"].map((label, i) => (
                <button
                  key={label}
                  aria-pressed={offset === i}
                  className={offset === i ? "selected" : ""}
                  disabled={busy}
                  onClick={() => setOffset(i)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!online && (
          <div className="notice">
            <WifiOff size={17} />
            Sin conexión. Puedes planificar con precios guardados o importados.
          </div>
        )}
        {shared.error && (
          <div className="notice error" role="alert">
            {shared.error}
          </div>
        )}
        {page !== "settings" ? (
          <>
            <section className="panel price-panel">
              <div className="section-header">
                <h2>
                  Precios{" "}
                  <span className="pill">
                    {day
                      ? day.source === "ree"
                        ? "REE · PVPC"
                        : "Importados"
                      : "Sin datos"}
                  </span>
                </h2>
                <div className="inline-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setModal("import")}
                  >
                    <Upload size={15} />
                    Importar
                  </button>
                  {state.settings.tariff === "pvpc" && (
                    <button
                      className="icon-button"
                      disabled={fetching || busy}
                      aria-label="Actualizar precios"
                      onClick={() => setRetry((v) => v + 1)}
                    >
                      <RefreshCw size={16} className={fetching ? "spin" : ""} />
                    </button>
                  )}
                </div>
              </div>
              {day ? (
                <PriceChart day={day} />
              ) : (
                <div className="empty-prices">
                  {fetching ? (
                    <>
                      <LoaderCircle className="spin" size={24} />
                      <p>Consultando precios…</p>
                    </>
                  ) : (
                    <>
                      <ChartNoAxesColumn size={30} />
                      <p>
                        {state.settings.tariff === "manual"
                          ? "Importa los precios de este día."
                          : offset === 1
                            ? "Los precios de mañana aún no están disponibles."
                            : "No hay precios para este día."}
                      </p>
                      <button
                        className="button"
                        onClick={() => setModal("import")}
                      >
                        Importar precios
                      </button>
                    </>
                  )}
                </div>
              )}
              {priceError && (
                <p
                  className={`price-warning ${day ? "" : "error-text"}`}
                  role="status"
                >
                  {day ? "Datos guardados. " : ""}
                  {priceError}
                </p>
              )}
              {day && (
                <div className="price-footnote">
                  <span>
                    {day.prices.length} horas ·{" "}
                    {day.source === "ree" ? "Sin impuestos" : "Unidades: €/kWh"}
                  </span>
                  <span>
                    Actualizado {timeLabel(Date.parse(day.fetchedAt), zone)}
                  </span>
                </div>
              )}
            </section>
            {page === "plan" ? (
              <div className="planner-grid">
                <section className="panel tasks-panel">
                  <div className="section-header">
                    <h2>
                      Tareas <span className="count">{active.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      disabled={state.tasks.length >= 5 || busy}
                      onClick={() => setModal("add")}
                    >
                      <Plus size={16} />
                      Añadir
                    </button>
                  </div>
                  <div className="task-list">
                    {state.tasks.map((t) => (
                      <article
                        className={`task-row ${t.enabled ? "" : "task-disabled"}`}
                        key={t.id}
                      >
                        <label className="task-toggle">
                          <input
                            type="checkbox"
                            checked={t.enabled}
                            disabled={busy}
                            aria-label={`Incluir ${t.name}`}
                            onChange={(e) =>
                              updateTasks(
                                state.tasks.map((v) =>
                                  v.id === t.id
                                    ? { ...v, enabled: e.target.checked }
                                    : v,
                                ),
                              )
                            }
                          />
                          <span>
                            <Check size={12} />
                          </span>
                        </label>
                        <div
                          className="task-symbol"
                          style={{ color: t.color, background: `${t.color}18` }}
                        >
                          <TaskIcon kind={t.kind} />
                        </div>
                        <div className="task-summary">
                          <strong>{t.name}</strong>
                          <span>
                            {t.duration / 60} h <b>·</b>{" "}
                            {Number(t.power.toFixed(3))} kW
                          </span>
                          <span className="task-window">
                            {minuteLabel(t.earliest)} –{" "}
                            {minuteLabel(Math.min(t.latest, t.deadline))}
                            {t.interruptible ? " · Flexible" : ""}
                          </span>
                        </div>
                        <button
                          className="icon-button"
                          disabled={busy}
                          aria-label={`Editar ${t.name}`}
                          onClick={() => setEdit(t)}
                        >
                          <Pencil size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!state.tasks.length && (
                    <p className="empty-task">
                      Añade una tarea para preparar tu horario.
                    </p>
                  )}
                  <div className="power-control">
                    <label htmlFor="max-power">
                      Límite simultáneo <span>Solo las tareas del plan</span>
                    </label>
                    <PowerLimit
                      value={state.settings.maxPower}
                      disabled={busy}
                      onSave={(v) => changeSetting({ maxPower: v })}
                      onError={(message) => alertUser(message, true)}
                    />
                  </div>
                  <button
                    className="primary calculate"
                    disabled={!day || !active.length || busy}
                    onClick={calculate}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={18} className="spin" />
                        Calculando…
                      </>
                    ) : (
                      <>
                        <Zap size={17} />
                        {plan ? "Recalcular plan" : "Calcular plan"}
                        <ArrowRight size={17} />
                      </>
                    )}
                  </button>
                </section>
                <section className="panel schedule-panel">
                  <div className="section-header">
                    <h2>
                      Horario{" "}
                      {plan && (
                        <span className="pill plan-ready">
                          <Check size={12} />
                          Listo
                        </span>
                      )}
                    </h2>
                    <span className="subtle">{offset ? "Mañana" : "Hoy"}</span>
                  </div>
                  {plan ? (
                    <PlanView
                      plan={plan}
                      reminders={!!state.reminders[key]}
                      onReminders={reminders}
                      onFeedback={alertUser}
                    />
                  ) : (
                    <div className="empty-plan">
                      <div className="empty-plan-icon">
                        <CalendarDays size={32} strokeWidth={1.4} />
                      </div>
                      <h3>
                        {busy ? "Buscando un horario" : "Sin plan calculado"}
                      </h3>
                      <p>
                        {busy
                          ? "Comprobando costes, ventanas y potencia."
                          : !day
                            ? "Añade precios para calcular el horario."
                            : "Revisa las tareas y pulsa Calcular plan."}
                      </p>
                      <div className="empty-timeline" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  )}
                </section>
              </div>
            ) : (
              day && (
                <section className="panel">
                  <div className="section-header">
                    <h2>Detalle por hora</h2>
                    <span className="subtle">€/kWh</span>
                  </div>
                  <div className="hour-grid">
                    {day.prices.map((p, i) => {
                      const starts = dayInstants(date, zone);
                      const start = starts[i * 2];
                      return (
                        <div className="hour-cell" key={i}>
                          <span>
                            {timeLabel(start, zone, day.prices.length !== 24)}
                          </span>
                          <strong>{p.toFixed(4).replace(".", ",")}</strong>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )
            )}
          </>
        ) : (
          <section className="panel settings-panel">
            <h2>Tarifa y zona</h2>
            <div className="form-grid">
              <label>
                Tarifa
                <select
                  disabled={busy}
                  value={state.settings.tariff}
                  onChange={(e) =>
                    changeSetting({
                      tariff: e.target.value as "pvpc" | "manual",
                    })
                  }
                >
                  <option value="pvpc">PVPC · Red Eléctrica</option>
                  <option value="manual">Indexada · precios importados</option>
                </select>
              </label>
              <label>
                Zona
                <select
                  disabled={busy}
                  value={state.settings.area}
                  onChange={(e) =>
                    changeSetting({ area: e.target.value as Area })
                  }
                >
                  <option value="pcb">Península y Baleares</option>
                  <option value="canarias">Canarias</option>
                  <option value="cym">Ceuta y Melilla</option>
                </select>
              </label>
            </div>
            <p className="field-help">
              Para una tarifa fija, los precios por hora no cambian el coste.
            </p>
            <div className="settings-divider" />
            <h2>Apariencia</h2>
            <div className="theme-options">
              {(
                [
                  { id: "light", name: "Claro", icon: Sun },
                  { id: "dark", name: "Oscuro", icon: Moon },
                  { id: "system", name: "Sistema", icon: Monitor },
                ] as const
              ).map((t) => (
                <button
                  aria-pressed={state.settings.theme === t.id}
                  className={state.settings.theme === t.id ? "selected" : ""}
                  key={t.id}
                  onClick={() => changeSetting({ theme: t.id as Theme })}
                >
                  <t.icon size={20} />
                  {t.name}
                </button>
              ))}
            </div>
            <div className="settings-divider" />
            <h2>Datos del dispositivo</h2>
            <p className="field-help">
              Tareas, precios y planes se guardan aquí.
            </p>
            <div className="settings-actions">
              <button
                onClick={() =>
                  download(
                    new Blob([JSON.stringify(state, null, 2)], {
                      type: "application/json",
                    }),
                    "optiluz-datos.json",
                  )
                }
              >
                <Download size={16} />
                Exportar datos
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => setModal("reset")}
              >
                Borrar datos
              </button>
            </div>
            <p className="version">OptiLuz · v0.1.0</p>
            {install && (
              <button
                className="button"
                onClick={async () => {
                  await install.prompt();
                  if ((await install.userChoice).outcome === "accepted")
                    setInstall(null);
                }}
              >
                <Download size={16} />
                Instalar app
              </button>
            )}
          </section>
        )}
        <footer className="main-footer">
          <span>OptiLuz</span>
          <button className="text-button" onClick={() => setModal("help")}>
            Datos y estimaciones
            <CircleHelp size={14} />
          </button>
        </footer>
      </main>
      {feedback && (
        <Feedback value={feedback} close={() => setFeedback(null)} />
      )}
      {edit && (
        <TaskEditor
          key={edit.id}
          task={edit}
          onClose={() => setEdit(null)}
          onSave={(t) => {
            updateTasks(state.tasks.map((v) => (v.id === t.id ? t : v)));
            setEdit(null);
          }}
          onDelete={() => {
            updateTasks(state.tasks.filter((t) => t.id !== edit.id));
            setEdit(null);
          }}
        />
      )}
      {modal === "add" && (
        <Modal title="Añadir tarea" onClose={() => setModal(null)}>
          <div className="template-list">
            {templates.map((t) => (
              <button
                key={t.kind}
                onClick={() => {
                  const task = { ...t, id: crypto.randomUUID() };
                  updateTasks([...state.tasks, task]);
                  setModal(null);
                  setEdit(task);
                }}
              >
                <span
                  className="task-symbol"
                  style={{ color: t.color, background: `${t.color}18` }}
                >
                  <TaskIcon kind={t.kind} />
                </span>
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {t.duration / 60} h · {t.power} kW
                  </small>
                </span>
                <Plus size={18} />
              </button>
            ))}
          </div>
          <p className="field-help">
            Hasta cinco tareas. Puedes cambiar el nombre y todos los valores.
          </p>
        </Modal>
      )}
      {modal === "import" && (
        <ImportPrices
          date={date}
          area={state.settings.area}
          existing={state.prices[`${date}:${state.settings.area}:manual`]}
          onClose={() => setModal(null)}
          onSave={(value) => {
            setState((s) =>
              invalidate({
                ...s,
                settings: { ...s.settings, tariff: "manual" },
                prices: {
                  ...s.prices,
                  [`${date}:${s.settings.area}:manual`]: value,
                },
              }),
            );
            setModal(null);
            alertUser("Precios importados.");
          }}
        />
      )}
      {modal === "help" && (
        <Modal title="Datos y estimaciones" onClose={() => setModal(null)}>
          <div className="help-content">
            <h3>Precios</h3>
            <p>
              El PVPC procede del archivo oficial de{" "}
              <a
                href="https://www.esios.ree.es/es/pvpc"
                target="_blank"
                rel="noreferrer"
              >
                Red Eléctrica
              </a>
              . No incluye impuestos ni el término fijo de potencia. Si faltan
              datos, puedes importar tu tarifa en €/kWh o €/MWh.
            </p>
            <h3>Plan</h3>
            <p>
              Se calcula en pasos de 30 minutos. El límite de potencia se aplica
              a las tareas incluidas: deja margen para los demás consumos del
              hogar.
            </p>
            <p>
              Las potencias de las plantillas son aproximadas. Ajusta el consumo
              a tu aparato. Una tarea flexible puede dividirse en varios tramos;
              las demás mantienen un ciclo continuo.
            </p>
            <h3>Recordatorios</h3>
            <p>
              La comparación con el horario habitual conserva su hora de inicio,
              sin ajustar sus solapamientos ni ventanas permitidas.
            </p>
            <p>
              Los avisos locales requieren permiso y la app abierta. El
              calendario descargable incluye avisos cinco minutos antes y
              funciona según tu aplicación de calendario.
            </p>
            <h3>Guardado y privacidad</h3>
            <p>
              Los datos se guardan en este navegador. Los enlaces compartidos
              contienen el horario, los nombres de las tareas y sus costes. Al
              borrar los datos del navegador, se elimina el guardado local.
            </p>
            <p>
              El plan propone un horario. Tú decides cuándo utilizar cada
              aparato.
            </p>
          </div>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="Borrar datos" onClose={() => setModal(null)}>
          <p>
            Se eliminarán las tareas, precios, planes y recordatorios de este
            dispositivo.
          </p>
          <div className="form-actions">
            <button onClick={() => setModal(null)}>Cancelar</button>
            <button
              className="danger-button"
              onClick={() => {
                setState(initialState());
                notified.current.clear();
                setModal(null);
                setRetry((v) => v + 1);
                alertUser("Datos borrados.");
              }}
            >
              Borrar datos
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Feedback({
  value,
  close,
}: {
  value: { message: string; error: boolean };
  close: () => void;
}) {
  return (
    <div
      className={`toast ${value.error ? "toast-error" : ""}`}
      role={value.error ? "alert" : "status"}
    >
      {value.error ? <CircleHelp size={18} /> : <Check size={18} />}
      <span>{value.message}</span>
      <button className="icon-button" aria-label="Cerrar aviso" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
function ImportPrices({
  date,
  area,
  existing,
  onSave,
  onClose,
}: {
  date: string;
  area: Area;
  existing?: PriceDay;
  onSave: (day: PriceDay) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(existing?.prices.join("\n") ?? "");
  const [unit, setUnit] = useState<"kwh" | "mwh">("kwh");
  const [error, setError] = useState("");
  const count = dayInstants(date, zoneFor(area)).length / 2;
  return (
    <Modal title="Importar precios" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(parseManual(text, date, area, unit));
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="import-meta">
          <span>{date}</span>
          <span>{count} precios horarios</span>
        </div>
        <label>
          Unidad
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            <option value="kwh">€/kWh</option>
            <option value="mwh">€/MWh</option>
          </select>
        </label>
        <label>
          Precios, desde las 00:00
          <textarea
            autoFocus
            required
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"0,12\n0,11\n0,10\n…"}
          />
        </label>
        <p className="field-help">
          Separa los valores por líneas, espacios o punto y coma. Se admite coma
          decimal y precios negativos.
          {count !== 24
            ? " Introduce las horas en orden cronológico; incluye la hora repetida o excluye la que no existe."
            : ""}{" "}
          Al importar, se selecciona la tarifa importada.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            Guardar precios
          </button>
        </div>
      </form>
    </Modal>
  );
}

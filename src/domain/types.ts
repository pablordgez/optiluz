export type Area = "pcb" | "canarias" | "cym";
export type Theme = "light" | "dark" | "system";
export interface Settings {
  area: Area;
  tariff: "pvpc" | "manual";
  maxPower: number;
  theme: Theme;
}
export interface Task {
  id: string;
  name: string;
  kind: string;
  color: string;
  enabled: boolean;
  duration: number;
  power: number;
  earliest: number;
  latest: number;
  deadline: number;
  usual: number;
  interruptible: boolean;
}
export interface PriceDay {
  date: string;
  area: Area;
  prices: number[];
  source: "ree" | "manual";
  fetchedAt: string;
}
export interface Slot {
  start: number;
  end: number;
  minute: number;
  label: string;
  price: number;
}
export interface Segment {
  start: number;
  end: number;
}
export interface PlannedTask {
  id: string;
  name: string;
  kind: string;
  color: string;
  power: number;
  cost: number;
  segments: Segment[];
}
export interface Plan {
  date: string;
  zone: string;
  source: "ree" | "manual";
  tasks: PlannedTask[];
  cost: number;
  usualCost: number | null;
  peakPower: number;
  optimal: boolean;
  generatedAt: string;
}
export interface State {
  version: 1;
  settings: Settings;
  tasks: Task[];
  prices: Record<string, PriceDay>;
  plans: Record<string, Plan>;
  reminders: Record<string, boolean>;
  notified: Record<string, boolean>;
}
export const templates: Omit<Task, "id">[] = [
  {
    name: "Lavadora",
    kind: "washer",
    color: "#4f81e8",
    enabled: true,
    duration: 120,
    power: 0.8,
    earliest: 480,
    latest: 1320,
    deadline: 1320,
    usual: 1140,
    interruptible: false,
  },
  {
    name: "Lavavajillas",
    kind: "dishwasher",
    color: "#ba83db",
    enabled: true,
    duration: 120,
    power: 0.7,
    earliest: 480,
    latest: 1440,
    deadline: 1440,
    usual: 1260,
    interruptible: false,
  },
  {
    name: "Termo",
    kind: "heater",
    color: "#ef9b43",
    enabled: true,
    duration: 180,
    power: 1.5,
    earliest: 0,
    latest: 1440,
    deadline: 1440,
    usual: 420,
    interruptible: true,
  },
  {
    name: "Secadora",
    kind: "dryer",
    color: "#e47786",
    enabled: true,
    duration: 90,
    power: 1.8,
    earliest: 480,
    latest: 1320,
    deadline: 1320,
    usual: 1080,
    interruptible: false,
  },
  {
    name: "Carga del coche",
    kind: "car",
    color: "#37aa94",
    enabled: true,
    duration: 240,
    power: 2.3,
    earliest: 0,
    latest: 1440,
    deadline: 1440,
    usual: 0,
    interruptible: true,
  },
];
export const initialState = (): State => ({
  version: 1,
  settings: { area: "pcb", tariff: "pvpc", maxPower: 3.45, theme: "system" },
  tasks: templates.slice(0, 3).map((t, i) => ({ ...t, id: `task-${i}` })),
  prices: {},
  plans: {},
  reminders: {},
  notified: {},
});

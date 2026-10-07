import {
  WashingMachine,
  Utensils,
  Droplets,
  Wind,
  Car,
  PlugZap,
} from "lucide-react";
export function TaskIcon({ kind }: { kind: string }) {
  const Icon =
    (
      {
        washer: WashingMachine,
        dishwasher: Utensils,
        heater: Droplets,
        dryer: Wind,
        car: Car,
      } as Record<string, typeof PlugZap>
    )[kind] ?? PlugZap;
  return <Icon size={22} strokeWidth={1.8} />;
}

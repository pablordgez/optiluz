import { openDB } from "idb";
import { initialState, type State } from "./domain/types";
const db = () =>
  openDB("optiluz", 1, {
    upgrade(db) {
      db.createObjectStore("local");
    },
  });
export async function loadState(): Promise<State> {
  const data = await (await db()).get("local", "state");
  return data?.version === 1 ? data : initialState();
}
export async function saveState(state: State) {
  await (await db()).put("local", state, "state");
}
export const priceKey = (date: string, area: string) => `${date}:${area}`;

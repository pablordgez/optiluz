import { openDB } from "idb";
import { initialState, type State } from "./domain/types";
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB("optiluz", 1, {
    upgrade(db) {
      db.createObjectStore("local");
    },
  }).catch((error) => {
    connection = undefined;
    throw error;
  }));
export async function loadState(): Promise<State> {
  const data = await (await db()).get("local", "state");
  return data?.version === 1 ? data : initialState();
}
export async function saveState(state: State) {
  await (await db()).put("local", state, "state");
}

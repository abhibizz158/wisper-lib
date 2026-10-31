import { openDB, type IDBPDatabase } from 'idb';

let connection: Promise<IDBPDatabase> | null = null;
const pending = new Map<string, Promise<void>>();
function database(): Promise<IDBPDatabase> {
  connection ??= openDB('wisper-lib-studio', 1, { upgrade(db) { db.createObjectStore('drafts'); } });
  return connection;
}
function enqueue(key: string, operation: () => Promise<void>): Promise<void> {
  const task = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  pending.set(key, task);
  void task.finally(() => { if (pending.get(key) === task) pending.delete(key); }).catch(() => {});
  return task;
}

/** Serialize per-draft writes so an older keystroke cannot replace a newer save. */
export const studioDrafts = {
  async read<T>(key: string): Promise<T | null> {
    await pending.get(key)?.catch(() => {});
    return (await (await database()).get('drafts', key)) ?? null;
  },
  write<T>(key: string, value: T): Promise<void> {
    return enqueue(key, async () => { await (await database()).put('drafts', value, key); });
  },
  clear(key: string): Promise<void> {
    return enqueue(key, async () => { await (await database()).delete('drafts', key); });
  },
};

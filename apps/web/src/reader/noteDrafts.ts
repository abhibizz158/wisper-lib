import { openDB } from 'idb';

export interface NoteFormDraft {
  title: string; body: string; tags: string; bookId: string;
  chapterId: string | null; location: string | null; selectedText: string;
  operationId: string; savedAt: number; baseRevision: number | null;
}
const database = () => openDB('wisper-lib-note-editor', 1, {
  upgrade(db) { db.createObjectStore('drafts'); },
});
let dbPromise: ReturnType<typeof database> | null = null;
const db = () => dbPromise ??= database();
const queues = new Map<string, Promise<unknown>>();

/** Serialize operations so a late draft write cannot restore an already-saved draft. */
function enqueue<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
export const noteDrafts = {
  read(key: string): Promise<NoteFormDraft | undefined> { return enqueue(key, async () => (await db()).get('drafts', key)); },
  write(key: string, draft: NoteFormDraft): Promise<void> { return enqueue(key, async () => { await (await db()).put('drafts', draft, key); }); },
  clear(key: string): Promise<void> { return enqueue(key, async () => { await (await db()).delete('drafts', key); }); },
};

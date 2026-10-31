/**
 * IndexedDB-backed draft store for note bodies.
 * Writes on every keystroke, cleared on confirmed save, recovered on load.
 *
 * Uses the `idb` library for a promise-based API around IndexedDB.
 */

import { openDB, type IDBPDatabase } from 'idb';

interface NoteDraft {
  body: string;
  title: string;
  annotationId?: string;
  savedAt: number;
}

const DB_NAME = 'wisper-lib';
const DB_VERSION = 1;
const STORE = 'note-drafts';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export const draftStore = {
  /** Save a draft. Key is typically 'note-draft-{bookId}' or 'note-draft-standalone'. */
  async save(key: string, draft: Omit<NoteDraft, 'savedAt'>): Promise<void> {
    const db = await getDb();
    await db.put(STORE, { ...draft, savedAt: Date.now() }, key);
  },

  /** Retrieve a saved draft, or null if none exists. */
  async get(key: string): Promise<NoteDraft | null> {
    const db = await getDb();
    return (await db.get(STORE, key)) ?? null;
  },

  /** Remove a draft after successful API save. */
  async clear(key: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE, key);
  },

  /** Remove all drafts for a user (on sign-out). */
  async clearAll(): Promise<void> {
    const db = await getDb();
    await db.clear(STORE);
  },
};

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  HISTORY_CACHE_DB,
  HISTORY_CACHE_STORE,
  getSessionIdFromUrl,
  readCachedMessages,
} from "./history-cache.js";

const SESSION = "session-abc";

// Minimal in-memory IndexedDB mock mirroring the calls the reader makes.

class MockRequest {
  constructor() {
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
    this.transaction = null;
    this.result = undefined;
    this.error = null;
  }
}

class MockObjectStoreNames {
  constructor(names) {
    this._names = names;
  }
  contains(name) {
    return this._names.includes(name);
  }
  [Symbol.iterator]() {
    return this._names[Symbol.iterator]();
  }
}

class MockStore {
  constructor(records) {
    this._records = records;
  }
  get(key) {
    const request = new MockRequest();
    setTimeout(() => {
      request.result = this._records.has(key) ? this._records.get(key) : undefined;
      request.onsuccess && request.onsuccess({ target: request });
    }, 0);
    return request;
  }
}

class MockDB {
  constructor(entry) {
    this._entry = entry;
    this.closed = false;
    this.objectStoreNames = new MockObjectStoreNames(Array.from(entry.stores.keys()));
  }
  transaction(storeName) {
    if (!this._entry.stores.has(storeName)) throw new Error("NotFoundError");
    const records = this._entry.stores.get(storeName);
    return { objectStore: () => new MockStore(records) };
  }
  close() {
    this.closed = true;
  }
}

class MockIndexedDB {
  constructor(databases = {}) {
    this._dbs = new Map();
    for (const [name, stores] of Object.entries(databases)) {
      this._dbs.set(name, {
        stores: new Map(
          Object.entries(stores).map(([storeName, records]) => [
            storeName,
            new Map(Object.entries(records)),
          ])
        ),
      });
    }
  }
  open(name) {
    const request = new MockRequest();
    setTimeout(() => {
      let entry = this._dbs.get(name);
      if (!entry) {
        // Missing DB: the reader aborts the upgrade, so nothing registers.
        let aborted = false;
        request.transaction = {
          abort() {
            aborted = true;
          },
        };
        request.onupgradeneeded && request.onupgradeneeded({ target: request });
        if (aborted) {
          request.error = new Error("AbortError");
          request.onerror && request.onerror({ target: request });
          return;
        }
        entry = { stores: new Map() };
        this._dbs.set(name, entry);
      }
      request.result = new MockDB(entry);
      request.onsuccess && request.onsuccess({ target: request });
    }, 0);
    return request;
  }
  setRecord(dbName, storeName, key, value) {
    this._dbs.get(dbName).stores.get(storeName).set(key, value);
  }
}

function makeRecord(sessionId, messages, extra = {}, session = {}) {
  return {
    data: {
      chat_session: { id: sessionId, ...session },
      chat_messages: messages,
      cache_control: "REPLACE",
    },
    timestamp: 123456,
    frontendVersion: "fv-6",
    ...extra,
  };
}

function makeIDB(records = {}) {
  return new MockIndexedDB({
    [HISTORY_CACHE_DB]: { [HISTORY_CACHE_STORE]: records },
  });
}

describe("readCachedMessages", () => {
  let idb;

  beforeEach(() => {
    idb = makeIDB({ [SESSION]: makeRecord(SESSION, [{ message_id: 1, role: "USER", fragments: [] }]) });
  });

  it("returns the cached messages for the session", async () => {
    const result = await readCachedMessages(SESSION, { idb });

    expect(result.status).toBe("hit");
    expect(result.chatMessages).toHaveLength(1);
    expect(result.chatMessages[0].message_id).toBe(1);
  });

  it("returns hit with an empty list when the record has no messages yet", async () => {
    const emptyIdb = makeIDB({ [SESSION]: makeRecord(SESSION, []) });

    const result = await readCachedMessages(SESSION, { idb: emptyIdb });

    expect(result.status).toBe("hit");
    expect(result.chatMessages).toEqual([]);
  });

  it("reports missing when the store has no record for the session", async () => {
    const result = await readCachedMessages("other-session", { idb });

    expect(result.status).toBe("missing");
  });

  it("polls until the record appears while waitMs allows it", async () => {
    const emptyIdb = makeIDB({});
    const session = "slow-session";
    setTimeout(() => {
      emptyIdb.setRecord(HISTORY_CACHE_DB, HISTORY_CACHE_STORE, session, makeRecord(session, []));
    }, 30);

    const result = await readCachedMessages(session, { idb: emptyIdb, waitMs: 500, intervalMs: 10 });

    expect(result.status).toBe("hit");
  });

  it("stops polling and reports missing once waitMs has elapsed", async () => {
    const emptyIdb = makeIDB({});

    const started = Date.now();
    const result = await readCachedMessages("never-cached", { idb: emptyIdb, waitMs: 40, intervalMs: 10 });

    expect(result.status).toBe("missing");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("never creates the database when it does not exist", async () => {
    const freshIdb = new MockIndexedDB();

    const result = await readCachedMessages(SESSION, { idb: freshIdb });

    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("AbortError");
    expect(freshIdb._dbs.has(HISTORY_CACHE_DB)).toBe(false);
  });

  it("reports unavailable when the store is absent", async () => {
    const noStoreIdb = new MockIndexedDB({ [HISTORY_CACHE_DB]: {} });

    const result = await readCachedMessages(SESSION, { idb: noStoreIdb });

    expect(result.status).toBe("unavailable");
    expect(noStoreIdb._dbs.has(HISTORY_CACHE_DB)).toBe(true);
  });

  it("reports unavailable when indexedDB is not available", async () => {
    const result = await readCachedMessages(SESSION, { idb: null });

    expect(result.status).toBe("unavailable");
  });

  it("rejects a record whose embedded session id does not match", async () => {
    const mismatched = makeIDB({ [SESSION]: makeRecord("someone-else", []) });

    const result = await readCachedMessages(SESSION, { idb: mismatched });

    expect(result.status).toBe("unavailable");
  });

  it("rejects a record with no chat_messages array", async () => {
    const malformed = makeIDB({ [SESSION]: { data: { chat_session: { id: SESSION } } } });

    const result = await readCachedMessages(SESSION, { idb: malformed });

    expect(result.status).toBe("unavailable");
  });

  describe("branch reconstruction", () => {
    // 1 ─ user
    //   ├─ 2 ─ assistant (abandoned reply)
    //   └─ 3 ─ assistant (picked reply) ─ 4 ─ user ─ 5 ─ assistant (head)
    const branched = [
      { message_id: 1, parent_id: null, role: "USER", fragments: [] },
      { message_id: 2, parent_id: 1, role: "ASSISTANT", fragments: [] },
      { message_id: 3, parent_id: 1, role: "ASSISTANT", fragments: [] },
      { message_id: 4, parent_id: 3, role: "USER", fragments: [] },
      { message_id: 5, parent_id: 4, role: "ASSISTANT", fragments: [] },
    ];

    it("follows the active branch past abandoned replies", async () => {
      const branchIdb = makeIDB({
        [SESSION]: makeRecord(SESSION, branched, {}, { current_message_id: 5 }),
      });

      const result = await readCachedMessages(SESSION, { idb: branchIdb });

      expect(result.status).toBe("hit");
      expect(result.chatMessages.map((m) => m.message_id)).toEqual([1, 3, 4, 5]);
    });

    it("follows the selection to another reply", async () => {
      const branchIdb = makeIDB({
        [SESSION]: makeRecord(SESSION, branched, {}, { current_message_id: 2 }),
      });

      const result = await readCachedMessages(SESSION, { idb: branchIdb });

      expect(result.status).toBe("hit");
      expect(result.chatMessages.map((m) => m.message_id)).toEqual([1, 2]);
    });

    it("stops at the first missing ancestor", async () => {
      const partial = makeIDB({
        [SESSION]: makeRecord(
          SESSION,
          [
            { message_id: 4, parent_id: 3, role: "USER", fragments: [] },
            { message_id: 5, parent_id: 4, role: "ASSISTANT", fragments: [] },
          ],
          {},
          { current_message_id: 5 }
        ),
      });

      const result = await readCachedMessages(SESSION, { idb: partial });

      expect(result.status).toBe("hit");
      expect(result.chatMessages.map((m) => m.message_id)).toEqual([4, 5]);
    });

    it("reports unavailable when the head is not in the snapshot", async () => {
      const branchIdb = makeIDB({
        [SESSION]: makeRecord(SESSION, branched, {}, { current_message_id: 99 }),
      });

      const result = await readCachedMessages(SESSION, { idb: branchIdb });

      expect(result.status).toBe("unavailable");
    });

    it("keeps every branch when the record has no head id", async () => {
      const branchIdb = makeIDB({ [SESSION]: makeRecord(SESSION, branched) });

      const result = await readCachedMessages(SESSION, { idb: branchIdb });

      expect(result.status).toBe("hit");
      expect(result.chatMessages.map((m) => m.message_id)).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe("getSessionIdFromUrl", () => {
  it("extracts the session id from a chat URL", () => {
    expect(getSessionIdFromUrl("https://chat.deepseek.com/chat/s/abc-123")).toBe("abc-123");
  });

  it("stops at a query string or hash", () => {
    expect(getSessionIdFromUrl("https://chat.deepseek.com/chat/s/abc-123?foo=1")).toBe("abc-123");
    expect(getSessionIdFromUrl("https://chat.deepseek.com/chat/s/abc-123#msg-2")).toBe("abc-123");
  });

  it("returns null off-session", () => {
    expect(getSessionIdFromUrl("https://chat.deepseek.com/")).toBeNull();
    expect(getSessionIdFromUrl("")).toBeNull();
    expect(getSessionIdFromUrl(undefined)).toBeNull();
  });
});

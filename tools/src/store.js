// Saves the person's data in this browser. IndexedDB first (large, durable), localStorage if that is blocked,
// plain memory as the last resort, and `kind` tells the UI which one is active so it can warn honestly.
const DB = "speakcosmos-user", ST = "kv", KEY = "state", LS = "sc_user_state";
function idb() {
  return new Promise((ok, no) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
      r.onblocked = () => no(new Error("blocked"));
    } catch (e) { no(e); }
  });
}
export function createStore() {
  let db = null, kind = "memory", mem = null, timer = 0, pending = null, lastError = "";
  const api = {
    get kind() { return kind; }, get error() { return lastError; },
    async load() {
      try { db = await idb(); kind = "browser"; const v = await new Promise((ok, no) => { const q = db.transaction(ST).objectStore(ST).get(KEY); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); if (v) return v; }
      catch (e) { db = null; lastError = String(e?.message || e); }
      try { const s = localStorage.getItem(LS); if (kind === "memory") kind = "local"; return s ? JSON.parse(s) : null; } catch (e) { return mem; }
    },
    /** debounced write; resolves when saved */
    save(state) {
      pending = state; clearTimeout(timer);
      return new Promise((ok) => { timer = setTimeout(async () => { const v = pending; pending = null; await api.flush(v); ok(); }, 350); });
    },
    async flush(v = pending) {
      if (!v) return; pending = null; mem = v;
      if (db) { try { await new Promise((ok, no) => { const tx = db.transaction(ST, "readwrite"); tx.objectStore(ST).put(v, KEY); tx.oncomplete = ok; tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error); }); return; } catch (e) { lastError = String(e?.message || e); } }
      try { localStorage.setItem(LS, JSON.stringify(v)); kind = db ? kind : "local"; } catch (e) { lastError = String(e?.message || e); kind = "memory"; }
    },
  };
  return api;
}

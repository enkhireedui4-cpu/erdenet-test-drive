import { UUID } from "../public/lead-validation.js";

export function validSheetUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "script.google.com" && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password && !url.port; } catch { return false; }
}

export function createSheetSync({ store, getConfig, fetcher = fetch }) {
  const active = new Map();
  let stopped = false, draining = false;
  function send(id) {
    if (stopped) return Promise.resolve(false);
    if (active.has(id)) return active.get(id);
    const task = (async () => {
      const lead = store.byId(id);
      if (!lead || lead.status === "synced") return !!lead;
      try {
        const config = getConfig();
        if (!validSheetUrl(config.url) || !config.secret) return false;
        const { receipt, status, attempts, nextAttemptAt, sheetId, ...payload } = lead;
        const response = await fetcher(config.url, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, secret: config.secret }),
          signal: AbortSignal.timeout(15_000), redirect: "follow",
        });
        if (!response.ok) throw new Error("Sheet unavailable");
        const result = await response.json();
        if (result?.ok !== true || result.requestId !== id || typeof result.id !== "string" || !UUID.test(result.id)) throw new Error("Unconfirmed sheet write");
        store.markSynced(id, result.id);
        return true;
      } catch {
        store.defer(id);
        return false;
      }
    })().finally(() => active.delete(id));
    active.set(id, task);
    return task;
  }
  return {
    send,
    async drain() {
      if (draining || stopped) return;
      draining = true;
      try { for (const lead of store.pending()) { if (stopped) break; await send(lead.id); } } finally { draining = false; }
    },
    async close() { stopped = true; await Promise.allSettled([...active.values()]); },
  };
}

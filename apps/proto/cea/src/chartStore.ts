const store = new Map<string, { plotlySchema: any; createdAt: number }>();

const TTL_MS = 60 * 60 * 1000; // 1 hour

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(id);
    }
  }
}

export function storeChart(plotlySchema: any): string {
  cleanup();
  const id = crypto.randomUUID();
  store.set(id, { plotlySchema, createdAt: Date.now() });
  return id;
}

export function getChart(id: string): any | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry.plotlySchema;
}

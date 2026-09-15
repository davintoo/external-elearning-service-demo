/**
 * The spec spies on `Storage.prototype.setItem`, so the object installed here must call
 * through that prototype - otherwise the spy never intercepts and the fallback test
 * silently tests nothing.
 */
class MemoryStorage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

// `Storage` is redefined too, so `vi.spyOn(Storage.prototype, 'setItem')` patches the very
// prototype the instance below dispatches through.
for (const [name, value] of [['Storage', MemoryStorage], ['localStorage', new MemoryStorage()]] as const) {
  Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
}

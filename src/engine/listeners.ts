/** Callbacks to call when something happens: `add` returns the removal, `emit` calls them all. */
export function listeners<A extends unknown[] = []>() {
  const list = new Set<(...args: A) => void>();
  return {
    add(fn: (...args: A) => void): () => void {
      list.add(fn);
      return () => void list.delete(fn);
    },
    emit(...args: A): void {
      for (const fn of [...list]) fn(...args);
    },
  };
}

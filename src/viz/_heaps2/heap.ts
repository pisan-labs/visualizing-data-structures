/**
 * A binary heap that counts its comparisons and reports every one, for the heap pattern pages
 * (top-k, k-way-merge, two-heaps-median). The binary-heap page teaches the heap itself; these
 * pages use one, so they need its moves as events they can narrate in their own words.
 *
 * - Positions are 0-based: the children of p are 2p + 1 and 2p + 2 (as in src/layouts/heap.ts).
 * - Order 'min' keeps the smallest key on top, 'max' the largest. Equal keys are ordered by
 *   `tie` (smaller first) when items have one, so a k-way merge takes equal heads in list order;
 *   otherwise equal keys never swap.
 * - Sift-down follows CLRS's MAX-HEAPIFY: compare the left child with the node (one comparison),
 *   then the right child with the better of the two (another), then swap if a child won. A node
 *   with one child costs one comparison. Sift-up compares a node with its parent, once per level.
 *
 * Every comparison is one `SiftEvent`, with the heap as it stands after it. The comparison that
 * decides a swap carries the swap, and its `items` are after the swap, so a page can show the
 * comparison and its result in one step.
 */

/** One value in a heap. The uid follows it wherever it moves. */
export interface HItem {
  uid: number;
  key: number;
  /** Breaks ties between equal keys: the smaller tie goes first. */
  tie?: number;
  /** Where the item came from (the list it belongs to, an index into the input). */
  src?: number;
}

export type Order = 'min' | 'max';

export interface SiftEvent {
  /** The position of the item that moves (the sifted one), before this event. */
  at: number;
  /** The position it is compared with: its parent (up) or a child (down). */
  other: number;
  /** 'parent' when sifting up; 'left' or 'right' when sifting down. */
  side: 'parent' | 'left' | 'right';
  /** The item being sifted. */
  moving: HItem;
  /** The two compared: up, the item and its parent; down, a child and the best so far. */
  challenger: HItem;
  holder: HItem;
  /** The challenger goes above the holder. */
  wins: boolean;
  /** The swap this comparison decides, as two positions; `items` are after it. */
  swap?: { p: number; q: number };
  /** The sift ends here: no swap, or the item reached the root or a leaf. */
  settled: boolean;
  items: HItem[];
  comparisons: number;
}

export class CountingHeap {
  items: HItem[];
  comparisons = 0;

  constructor(
    readonly order: Order,
    items: readonly HItem[] = [],
  ) {
    this.items = [...items];
  }

  get size(): number {
    return this.items.length;
  }

  top(): HItem | undefined {
    return this.items[0];
  }

  /** a belongs above b. Counts nothing: callers count. */
  above(a: HItem, b: HItem): boolean {
    if (a.key !== b.key) return this.order === 'min' ? a.key < b.key : a.key > b.key;
    return a.tie !== undefined && b.tie !== undefined && a.tie < b.tie;
  }

  /** Compare two items, counting it. */
  compare(a: HItem, b: HItem): boolean {
    this.comparisons++;
    return this.above(a, b);
  }

  private swapAt(p: number, q: number) {
    const t = this.items[p]!;
    this.items[p] = this.items[q]!;
    this.items[q] = t;
  }

  /** Put an item at the end and sift it up. */
  push(item: HItem): SiftEvent[] {
    this.items.push(item);
    return this.siftUp(this.items.length - 1);
  }

  /** Replace the top with an item and sift it down. The heap must not be empty. */
  replaceTop(item: HItem): SiftEvent[] {
    this.items[0] = item;
    return this.siftDown(0);
  }

  /** Take the top out: the last item moves to the root and sifts down. */
  pop(): { top: HItem; events: SiftEvent[] } {
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length === 0) return { top, events: [] };
    this.items[0] = last;
    return { top, events: this.siftDown(0) };
  }

  siftUp(start: number): SiftEvent[] {
    const out: SiftEvent[] = [];
    let p = start;
    while (p > 0) {
      const q = Math.floor((p - 1) / 2);
      const me = this.items[p]!;
      const parent = this.items[q]!;
      const wins = this.compare(me, parent);
      if (wins) this.swapAt(p, q);
      out.push({
        at: p,
        other: q,
        side: 'parent',
        moving: me,
        challenger: me,
        holder: parent,
        wins,
        ...(wins ? { swap: { p, q } } : {}),
        settled: !wins || q === 0,
        items: [...this.items],
        comparisons: this.comparisons,
      });
      if (!wins) break;
      p = q;
    }
    return out;
  }

  siftDown(start: number): SiftEvent[] {
    const out: SiftEvent[] = [];
    const n = this.items.length;
    let p = start;
    for (;;) {
      const l = 2 * p + 1;
      const r = 2 * p + 2;
      if (l >= n) break;
      let best = p;
      const moving = this.items[p]!;
      const events: Omit<SiftEvent, 'swap' | 'settled' | 'items' | 'comparisons'>[] = [];
      const counts: number[] = [];
      for (const [c, side] of [
        [l, 'left'],
        [r, 'right'],
      ] as const) {
        if (c >= n) continue;
        const challenger = this.items[c]!;
        const holder = this.items[best]!;
        const wins = this.compare(challenger, holder);
        events.push({ at: p, other: c, side, moving, challenger, holder, wins });
        counts.push(this.comparisons);
        if (wins) best = c;
      }
      const before = [...this.items];
      if (best !== p) this.swapAt(p, best);
      const after = [...this.items];
      const leaf = best !== p && 2 * best + 1 >= n;
      events.forEach((e, k) => {
        const last = k === events.length - 1;
        out.push({
          ...e,
          ...(last && best !== p ? { swap: { p, q: best } } : {}),
          settled: last && (best === p || leaf),
          items: last ? after : before,
          comparisons: counts[k]!,
        });
      });
      if (best === p) break;
      p = best;
    }
    return out;
  }
}

/** Heights of complete binary trees: 0 for one node, -1 for none. */
export const heightOf = (n: number) => (n <= 0 ? -1 : Math.floor(Math.log2(n)));

/** The size of a full tree as tall as a heap of n: the slots a layout reserves for it. */
export const fullSize = (n: number) => 2 ** (heightOf(Math.max(1, n)) + 1) - 1;

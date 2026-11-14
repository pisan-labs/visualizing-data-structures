/**
 * The interview patterns StepWise teaches, and the page each one lives on (PLAN.md section 21).
 * The "spot it" practice kind (./spot-it.ts) draws its wrong options from this list, and the
 * pattern map page links every entry.
 *
 * - `id`: what a spot-it table names. It is the page id, unless a page someday holds more than
 *   one pattern; then each gets its own id and they share `page`.
 * - `name`: short, as a choice option shows it ("Sliding window"). Names are distinct.
 * - `page`: the page id (src/viz/<page>/). Some pages are planned and not live yet; link to one
 *   only when it is live (a folder with an index.ts).
 *
 * The list covers every page of the catalog families "Array and string tricks", "Intervals",
 * "Linked list tricks", "Heap patterns", "Search templates", "Bit tricks", "DP patterns",
 * "Design a data structure" and "Techniques", plus the live pages that are patterns too (cycle
 * detection, binary search, backtracking, bitmasks, union-find, topological sort, tries, the LRU
 * cache and Dijkstra). Add to the end; never rename an id, since practice tables name them.
 */
export interface Pattern {
  id: string;
  name: string;
  page: string;
}

export const PATTERNS: readonly Pattern[] = [
  // Array and string tricks
  { id: 'prefix-sum-hashmap', name: 'Prefix sums with a hash map', page: 'prefix-sum-hashmap' },
  { id: 'kadane', name: "Kadane's maximum subarray", page: 'kadane' },
  { id: 'frequency-counting', name: 'Frequency counting', page: 'frequency-counting' },
  { id: 'difference-array', name: 'Difference array', page: 'difference-array' },
  { id: 'dutch-flag', name: 'Three-way partition', page: 'dutch-flag' },
  { id: 'cyclic-sort', name: 'Cyclic sort', page: 'cyclic-sort' },
  { id: 'matrix-traversal', name: 'Matrix traversal (spiral, rotate)', page: 'matrix-traversal' },
  // Intervals
  { id: 'merge-intervals', name: 'Merge intervals', page: 'merge-intervals' },
  { id: 'sweep-line', name: 'Sweep line', page: 'sweep-line' },
  // Linked list tricks
  { id: 'fast-slow-pointers', name: 'Fast and slow pointers', page: 'fast-slow-pointers' },
  { id: 'merge-sorted-lists', name: 'Merge sorted lists', page: 'merge-sorted-lists' },
  { id: 'reverse-k-group', name: 'Reverse in groups of k', page: 'reverse-k-group' },
  // Heap patterns
  { id: 'top-k', name: 'Top k with a heap', page: 'top-k' },
  { id: 'k-way-merge', name: 'K-way merge', page: 'k-way-merge' },
  { id: 'two-heaps-median', name: 'Two heaps (running median)', page: 'two-heaps-median' },
  // Search templates
  { id: 'binary-search-answer', name: 'Binary search on the answer', page: 'binary-search-answer' },
  { id: 'state-space-bfs', name: 'BFS over states', page: 'state-space-bfs' },
  { id: 'combination-sum', name: 'Backtracking with pruning', page: 'combination-sum' },
  // Bit tricks
  { id: 'xor-tricks', name: 'XOR tricks', page: 'xor-tricks' },
  // DP patterns
  { id: 'dp-grid-paths', name: 'DP on a grid', page: 'dp-grid-paths' },
  { id: 'dp-state-machine', name: 'DP over states in time', page: 'dp-state-machine' },
  { id: 'dp-interval', name: 'DP over intervals', page: 'dp-interval' },
  { id: 'dp-tree', name: 'DP on trees', page: 'dp-tree' },
  { id: 'dp-bitmask', name: 'DP over subsets', page: 'dp-bitmask' },
  // Design a data structure
  { id: 'min-stack', name: 'Min stack', page: 'min-stack' },
  { id: 'two-stack-queue', name: 'Queue from two stacks', page: 'two-stack-queue' },
  { id: 'randomized-set', name: 'Array plus index map', page: 'randomized-set' },
  { id: 'rate-limiter', name: 'Rate limiter', page: 'rate-limiter' },
  { id: 'lfu-cache', name: 'LFU cache', page: 'lfu-cache' },
  // Techniques
  { id: 'two-pointers', name: 'Two pointers', page: 'two-pointers' },
  { id: 'sliding-window', name: 'Sliding window', page: 'sliding-window' },
  { id: 'monotonic-stack', name: 'Monotonic stack', page: 'monotonic-stack' },
  { id: 'monotonic-queue', name: 'Monotonic queue', page: 'monotonic-queue' },
  // Live pages that are patterns too
  { id: 'floyd-cycle', name: 'Cycle detection (tortoise and hare)', page: 'floyd-cycle' },
  { id: 'binary-search', name: 'Binary search', page: 'binary-search' },
  { id: 'backtracking', name: 'Backtracking (subsets, permutations)', page: 'backtracking' },
  { id: 'bitmask', name: 'Bitmasks', page: 'bitmask' },
  { id: 'disjoint-sets', name: 'Union-find', page: 'disjoint-sets' },
  { id: 'topo-indegree', name: 'Topological sort', page: 'topo-indegree' },
  { id: 'trie', name: 'Trie (prefix tree)', page: 'trie' },
  { id: 'lru-cache', name: 'LRU cache (map plus list)', page: 'lru-cache' },
  { id: 'dijkstra', name: "Dijkstra's shortest paths", page: 'dijkstra' },
];

const byId = new Map(PATTERNS.map((p) => [p.id, p]));

/** The pattern with this id. Throws for an unknown id, so a typo in a table fails its tests. */
export function pattern(id: string): Pattern {
  const p = byId.get(id);
  if (!p) throw new Error(`No pattern "${id}" in PATTERNS (src/viz/_patterns/patterns.ts).`);
  return p;
}

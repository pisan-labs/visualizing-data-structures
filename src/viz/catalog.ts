import { liveIds } from './registry';

/**
 * Everything planned for the site, by family (PLAN.md Appendix B). Items whose id is in the
 * registry are live; the rest show as planned.
 * - `added`: not on the Galles/Lucet site.
 * - `advanced`: beyond a typical first data structures and algorithms course.
 */
export interface CatalogItem {
  id: string;
  title: string;
  added?: boolean;
  advanced?: boolean;
}

export type Pathway = 'structures' | 'algorithms';

export interface Family {
  name: string;
  /** Which course pathways list this family. */
  pathways: Pathway[];
  items: CatalogItem[];
}

export const pathways: { id: Pathway; label: string }[] = [
  { id: 'structures', label: 'Data structures' },
  { id: 'algorithms', label: 'Algorithms' },
];

export const families: Family[] = [
  {
    name: 'Stacks, queues and arrays',
    pathways: ['structures'],
    items: [
      { id: 'stack-array', title: 'Stack (array)' },
      { id: 'stack-list', title: 'Stack (linked list)' },
      { id: 'queue-array', title: 'Queue (circular array)' },
      { id: 'queue-list', title: 'Queue (linked list)' },
      { id: 'deque-array', title: 'Deque (circular array)', added: true },
      { id: 'deque-list', title: 'Deque (linked list)', added: true },
      { id: 'dynamic-array', title: 'Dynamic array (resizing)', added: true },
      { id: 'sorted-array', title: 'Sorted vs unsorted array', added: true },
    ],
  },
  {
    name: 'Linked lists',
    pathways: ['structures'],
    items: [
      { id: 'linked-list', title: 'Singly linked list', added: true },
      { id: 'doubly-linked-list', title: 'Doubly linked list', added: true },
      { id: 'circular-linked-list', title: 'Circular linked list', added: true },
      { id: 'floyd-cycle', title: 'Cycle detection (tortoise and hare)', added: true },
    ],
  },
  {
    name: 'Searching and sorting',
    pathways: ['algorithms'],
    items: [
      { id: 'linear-search', title: 'Linear search', added: true },
      { id: 'binary-search', title: 'Binary search (and its variants)', added: true },
      { id: 'bubble-sort', title: 'Bubble sort' },
      { id: 'cocktail-sort', title: 'Cocktail shaker sort', added: true },
      { id: 'selection-sort', title: 'Selection sort' },
      { id: 'insertion-sort', title: 'Insertion sort' },
      { id: 'shell-sort', title: 'Shell sort' },
      { id: 'merge-sort', title: 'Merge sort' },
      { id: 'quick-sort', title: 'Quicksort' },
      { id: 'quickselect', title: 'Quickselect', added: true },
      { id: 'heap-sort', title: 'Heap sort' },
      { id: 'counting-sort', title: 'Counting sort' },
      { id: 'radix-sort', title: 'Radix sort' },
      { id: 'bucket-sort', title: 'Bucket sort' },
    ],
  },
  {
    name: 'Trees',
    pathways: ['structures'],
    items: [
      { id: 'binary-tree', title: 'Binary tree and traversals', added: true },
      { id: 'bst', title: 'Binary search tree' },
      { id: 'avl', title: 'AVL tree' },
      { id: 'red-black', title: 'Red-black tree' },
      { id: 'splay', title: 'Splay tree' },
      { id: 'treap', title: 'Treap', added: true },
      { id: 'b-tree', title: 'B-tree' },
      { id: 'two-four-tree', title: '2-4 tree', added: true },
      { id: 'b-plus-tree', title: 'B+ tree' },
      { id: 'skip-list', title: 'Skip list' },
    ],
  },
  {
    name: 'Heaps and priority queues',
    pathways: ['structures'],
    items: [
      { id: 'binary-heap', title: 'Binary heap' },
      { id: 'leftist-heap', title: 'Leftist heap' },
      { id: 'skew-heap', title: 'Skew heap' },
      { id: 'binomial-queue', title: 'Binomial queue' },
      { id: 'fibonacci-heap', title: 'Fibonacci heap' },
    ],
  },
  {
    name: 'Hashing and maps',
    pathways: ['structures'],
    items: [
      { id: 'hash-chaining', title: 'Separate chaining' },
      { id: 'hash-open', title: 'Open addressing (linear, quadratic, double)' },
      { id: 'hash-buckets', title: 'Hashing with buckets' },
      { id: 'hash-rehash', title: 'Rehashing and load factor', added: true },
      { id: 'lru-cache', title: 'LRU cache', added: true, advanced: true },
    ],
  },
  {
    name: 'Recursion',
    pathways: ['structures', 'algorithms'],
    items: [
      { id: 'factorial', title: 'Factorial' },
      { id: 'reverse-string', title: 'Reversing a string' },
      { id: 'fibonacci-calls', title: 'Fibonacci call tree', added: true },
      { id: 'n-queens', title: 'N-Queens' },
      { id: 'recursion-dag', title: 'Recursion tree vs memoized DAG', added: true },
      {
        id: 'backtracking',
        title: 'Backtracking (subsets, permutations)',
        added: true,
        advanced: true,
      },
    ],
  },
  {
    name: 'Dynamic programming',
    pathways: ['algorithms'],
    items: [
      { id: 'dp-fibonacci', title: 'Fibonacci numbers' },
      { id: 'dp-change', title: 'Making change' },
      { id: 'dp-lcs', title: 'Longest common subsequence' },
      { id: 'dp-edit-distance', title: 'Edit distance', added: true },
      { id: 'dp-knapsack', title: '0/1 knapsack', added: true },
    ],
  },
  {
    name: 'Foundations',
    pathways: ['structures', 'algorithms'],
    items: [
      { id: 'memory-model', title: 'Memory model: values, references, aliasing', added: true },
      { id: 'big-o-lab', title: 'Big-O growth lab', added: true },
      { id: 'master-theorem', title: 'Recurrences and the Master theorem', added: true },
      { id: 'bitmask', title: 'Bitmasks and subsets', added: true, advanced: true },
    ],
  },
  {
    name: 'Strings',
    pathways: ['algorithms'],
    items: [
      { id: 'brute-force-search', title: 'Brute-force string search', added: true },
      { id: 'kmp', title: 'Knuth-Morris-Pratt' },
      { id: 'boyer-moore', title: 'Boyer-Moore' },
      { id: 'rabin-karp', title: 'Rabin-Karp', added: true },
      { id: 'trie', title: 'Trie' },
      { id: 'compressed-trie', title: 'Compressed trie' },
      { id: 'huffman', title: 'Huffman coding' },
      { id: 'suffix-array', title: 'Suffix array and LCP', added: true, advanced: true },
      { id: 'suffix-tree', title: 'Suffix tree', added: true, advanced: true },
    ],
  },
  {
    name: 'Graphs',
    pathways: ['structures', 'algorithms'],
    items: [
      { id: 'graph-representations', title: 'Graph representations', added: true },
      { id: 'bfs', title: 'Breadth-first search' },
      { id: 'grid-bfs', title: 'Shortest path in a grid (BFS)', added: true },
      { id: 'dfs', title: 'Depth-first search' },
      { id: 'connected-components', title: 'Connected components' },
      { id: 'bipartite', title: 'Bipartite check', added: true },
      { id: 'topo-indegree', title: 'Topological sort (indegree)' },
      { id: 'topo-dfs', title: 'Topological sort (DFS)' },
      { id: 'scc', title: 'Strongly connected components', added: true },
      { id: 'bridges', title: 'Cut vertices and bridges', added: true },
      { id: 'dijkstra', title: "Dijkstra's shortest paths" },
      { id: 'bellman-ford', title: 'Bellman-Ford', added: true },
      { id: 'dag-shortest-paths', title: 'Shortest paths in a DAG', added: true },
      { id: 'a-star', title: 'A* search', added: true },
      { id: 'floyd-warshall', title: 'Floyd-Warshall' },
      { id: 'prim', title: "Prim's minimum spanning tree" },
      { id: 'kruskal', title: "Kruskal's minimum spanning tree" },
      { id: 'disjoint-sets', title: 'Disjoint sets (union-find)' },
      { id: 'two-sat', title: '2-SAT', added: true, advanced: true },
    ],
  },
  {
    name: 'Flow and matching',
    pathways: ['algorithms'],
    items: [
      { id: 'max-flow', title: 'Maximum flow and minimum cut', added: true },
      { id: 'bipartite-matching', title: 'Bipartite matching', added: true },
      { id: 'min-cost-flow', title: 'Min-cost flow', added: true, advanced: true },
      {
        id: 'weighted-matching',
        title: 'Weighted matching (Hungarian)',
        added: true,
        advanced: true,
      },
      { id: 'general-matching', title: 'General matching (blossom)', added: true, advanced: true },
    ],
  },
  {
    name: 'Range queries',
    pathways: ['structures'],
    items: [
      { id: 'range-queries', title: 'Prefix sums and sparse tables', added: true, advanced: true },
      { id: 'fenwick-tree', title: 'Fenwick tree', added: true, advanced: true },
      { id: 'segment-tree', title: 'Segment tree (lazy propagation)', added: true, advanced: true },
    ],
  },
  {
    name: 'Geometry',
    pathways: ['algorithms'],
    items: [
      { id: 'convex-hull', title: 'Convex hull', added: true },
      { id: 'polygon', title: 'Polygon algorithms', added: true, advanced: true },
      { id: 'rotate-scale-2d', title: '2D rotation and scale' },
      { id: 'rotate-translate-2d', title: '2D rotation and translation' },
      { id: 'coordinates-2d', title: '2D change of coordinates' },
      { id: 'rotate-scale-3d', title: '3D rotation and scale' },
      { id: 'coordinates-3d', title: '3D change of coordinates' },
    ],
  },
  {
    name: 'Hard problems',
    pathways: ['algorithms'],
    items: [
      { id: 'np-reductions', title: 'NP-completeness reductions map', added: true },
      {
        id: 'tsp',
        title: 'Traveling salesperson: exact vs approximate',
        added: true,
        advanced: true,
      },
      { id: 'vertex-cover', title: 'Minimum vertex cover', added: true, advanced: true },
      { id: 'steiner-tree', title: 'Steiner tree', added: true, advanced: true },
    ],
  },
];

export const isLive = (id: string): boolean => liveIds.includes(id);

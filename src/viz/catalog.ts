import { vizzes } from './registry';

/**
 * Everything planned for the site, by family. Items whose id is in the registry are live;
 * the rest are shown as planned. `added` marks items that were not on the Galles/Lucet site.
 */
export interface CatalogItem {
  id: string;
  title: string;
  added?: boolean;
}

export interface Family {
  name: string;
  items: CatalogItem[];
}

export const families: Family[] = [
  {
    name: 'Linear structures',
    items: [
      { id: 'stack-array', title: 'Stack (array)' },
      { id: 'stack-list', title: 'Stack (linked list)' },
      { id: 'queue-array', title: 'Queue (circular array)' },
      { id: 'queue-list', title: 'Queue (linked list)' },
      { id: 'linked-list', title: 'Singly linked list', added: true },
      { id: 'doubly-linked-list', title: 'Doubly linked list', added: true },
      { id: 'dynamic-array', title: 'Dynamic array (resizing)', added: true },
      { id: 'deque', title: 'Deque', added: true },
    ],
  },
  {
    name: 'Recursion',
    items: [
      { id: 'factorial', title: 'Factorial' },
      { id: 'reverse-string', title: 'Reversing a string' },
      { id: 'n-queens', title: 'N-Queens' },
    ],
  },
  {
    name: 'Sorting and searching',
    items: [
      { id: 'binary-search', title: 'Binary search', added: true },
      { id: 'bubble-sort', title: 'Bubble sort' },
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
    name: 'Search trees',
    items: [
      { id: 'bst', title: 'Binary search tree' },
      { id: 'avl', title: 'AVL tree' },
      { id: 'red-black', title: 'Red-black tree' },
      { id: 'splay', title: 'Splay tree' },
      { id: 'treap', title: 'Treap', added: true },
      { id: 'b-tree', title: 'B-tree' },
      { id: 'b-plus-tree', title: 'B+ tree' },
      { id: 'skip-list', title: 'Skip list' },
    ],
  },
  {
    name: 'Hashing',
    items: [
      { id: 'hash-chaining', title: 'Separate chaining' },
      { id: 'hash-open', title: 'Open addressing (linear, quadratic, double)' },
      { id: 'hash-buckets', title: 'Hashing with buckets' },
      { id: 'hash-rehash', title: 'Rehashing', added: true },
    ],
  },
  {
    name: 'Heaps and priority queues',
    items: [
      { id: 'binary-heap', title: 'Binary heap' },
      { id: 'leftist-heap', title: 'Leftist heap' },
      { id: 'skew-heap', title: 'Skew heap' },
      { id: 'binomial-queue', title: 'Binomial queue' },
      { id: 'fibonacci-heap', title: 'Fibonacci heap' },
    ],
  },
  {
    name: 'Strings',
    items: [
      { id: 'trie', title: 'Trie' },
      { id: 'compressed-trie', title: 'Compressed trie' },
      { id: 'kmp', title: 'Knuth-Morris-Pratt' },
      { id: 'boyer-moore', title: 'Boyer-Moore' },
      { id: 'huffman', title: 'Huffman coding' },
    ],
  },
  {
    name: 'Graphs',
    items: [
      { id: 'bfs', title: 'Breadth-first search' },
      { id: 'dfs', title: 'Depth-first search' },
      { id: 'connected-components', title: 'Connected components' },
      { id: 'scc', title: 'Strongly connected components', added: true },
      { id: 'topo-indegree', title: 'Topological sort (indegree)' },
      { id: 'topo-dfs', title: 'Topological sort (DFS)' },
      { id: 'dijkstra', title: "Dijkstra's shortest paths" },
      { id: 'bellman-ford', title: 'Bellman-Ford', added: true },
      { id: 'a-star', title: 'A* search', added: true },
      { id: 'prim', title: "Prim's minimum spanning tree" },
      { id: 'kruskal', title: "Kruskal's minimum spanning tree" },
      { id: 'floyd-warshall', title: 'Floyd-Warshall' },
      { id: 'disjoint-sets', title: 'Disjoint sets (union-find)' },
    ],
  },
  {
    name: 'Dynamic programming',
    items: [
      { id: 'dp-fibonacci', title: 'Fibonacci numbers' },
      { id: 'dp-change', title: 'Making change' },
      { id: 'dp-lcs', title: 'Longest common subsequence' },
      { id: 'dp-edit-distance', title: 'Edit distance', added: true },
      { id: 'dp-knapsack', title: '0/1 knapsack', added: true },
    ],
  },
  {
    name: 'Geometry',
    items: [
      { id: 'rotate-scale-2d', title: '2D rotation and scale' },
      { id: 'rotate-translate-2d', title: '2D rotation and translation' },
      { id: 'coordinates-2d', title: '2D change of coordinates' },
      { id: 'rotate-scale-3d', title: '3D rotation and scale' },
      { id: 'coordinates-3d', title: '3D change of coordinates' },
    ],
  },
];

export const isLive = (id: string): boolean => vizzes.some((v) => v.id === id);

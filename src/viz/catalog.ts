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

export type Pathway = 'structures' | 'algorithms' | 'computation' | 'ai';

export interface Family {
  name: string;
  /** Which course pathways list this family. */
  pathways: Pathway[];
  items: CatalogItem[];
}

export const pathways: { id: Pathway; label: string }[] = [
  { id: 'structures', label: 'Data structures' },
  { id: 'algorithms', label: 'Algorithms' },
  { id: 'computation', label: 'Theory of computation' },
  { id: 'ai', label: 'AI and LLMs' },
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
      { id: 'interpolation-search', title: 'Interpolation search', added: true },
      { id: 'exponential-search', title: 'Exponential search', added: true },
      { id: 'ternary-search', title: 'Ternary search', added: true },
      { id: 'comb-sort', title: 'Comb sort', added: true },
      { id: 'gnome-sort', title: 'Gnome sort', added: true },
      { id: 'introsort', title: 'Introsort', added: true, advanced: true },
      { id: 'timsort', title: 'Timsort', added: true, advanced: true },
      { id: 'bitonic-sort', title: 'Bitonic sorting network', added: true, advanced: true },
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
      { id: 'cartesian-tree', title: 'Cartesian tree', added: true },
      { id: 'scapegoat-tree', title: 'Scapegoat tree', added: true, advanced: true },
      { id: 'aa-tree', title: 'AA tree', added: true, advanced: true },
      { id: 'interval-tree', title: 'Interval tree', added: true, advanced: true },
      { id: 'kd-tree', title: 'k-d tree', added: true, advanced: true },
      { id: 'quadtree', title: 'Quadtree', added: true, advanced: true },
      { id: 'rope', title: 'Rope', added: true, advanced: true },
      { id: 'persistent-bst', title: 'Persistent BST', added: true, advanced: true },
      { id: 'merkle-tree', title: 'Merkle tree', added: true, advanced: true },
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
      { id: 'd-ary-heap', title: 'd-ary heap', added: true },
      { id: 'min-max-heap', title: 'Min-max heap', added: true, advanced: true },
      { id: 'pairing-heap', title: 'Pairing heap', added: true, advanced: true },
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
      { id: 'bloom-filter', title: 'Bloom filter', added: true },
      { id: 'cuckoo-hashing', title: 'Cuckoo hashing', added: true, advanced: true },
      { id: 'robin-hood-hashing', title: 'Robin Hood hashing', added: true, advanced: true },
      { id: 'consistent-hashing', title: 'Consistent hashing', added: true, advanced: true },
      { id: 'count-min-sketch', title: 'Count-min sketch', added: true, advanced: true },
      { id: 'hyperloglog', title: 'HyperLogLog', added: true, advanced: true },
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
      { id: 'dp-lis', title: 'Longest increasing subsequence', added: true },
      { id: 'dp-rod-cutting', title: 'Rod cutting', added: true },
      { id: 'dp-subset-sum', title: 'Subset sum', added: true },
      { id: 'dp-matrix-chain', title: 'Matrix-chain order', added: true },
      { id: 'dp-palindrome', title: 'Longest palindromic subsequence', added: true },
    ],
  },
  {
    name: 'Foundations',
    pathways: ['structures', 'algorithms'],
    items: [
      { id: 'memory-model', title: 'Memory model: values, references, aliasing', added: true },
      { id: 'big-o-lab', title: 'Big-O growth lab', added: true },
      { id: 'big-o-definition', title: 'Big-O, Ω and Θ by definition', added: true },
      { id: 'loop-counting', title: 'Counting steps in loops', added: true },
      { id: 'doubling-experiment', title: 'Doubling experiments', added: true },
      { id: 'amortized-analysis', title: 'Amortized analysis', added: true },
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
      { id: 'z-algorithm', title: 'Z-algorithm', added: true },
      { id: 'aho-corasick', title: 'Aho-Corasick', added: true, advanced: true },
      { id: 'manacher', title: 'Manacher (longest palindrome)', added: true, advanced: true },
      { id: 'burrows-wheeler', title: 'Burrows-Wheeler transform', added: true, advanced: true },
      { id: 'lz-compression', title: 'LZ77 and LZW compression', added: true, advanced: true },
      { id: 'string-hashing', title: 'String hashing (polynomial rolling hash)', added: true },
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
      { id: 'euler-path', title: 'Euler paths (Hierholzer)', added: true },
      { id: 'graph-coloring', title: 'Graph coloring', added: true },
      { id: 'bidirectional-search', title: 'Bidirectional search', added: true },
      { id: 'boruvka', title: 'Borůvka MST', added: true, advanced: true },
      { id: 'johnson', title: 'Johnson all-pairs shortest paths', added: true, advanced: true },
      { id: 'lca', title: 'Lowest common ancestor (binary lifting)', added: true, advanced: true },
      { id: 'pagerank', title: 'PageRank', added: true, advanced: true },
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
      { id: 'push-relabel', title: 'Push-relabel max flow', added: true, advanced: true },
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
      { id: 'closest-pair', title: 'Closest pair of points', added: true },
      {
        id: 'segment-intersection',
        title: 'Segment intersection (sweep line)',
        added: true,
        advanced: true,
      },
      { id: 'delaunay', title: 'Delaunay triangulation and Voronoi', added: true, advanced: true },
    ],
  },
  {
    name: 'Techniques',
    pathways: ['algorithms'],
    items: [
      { id: 'two-pointers', title: 'Two pointers', added: true },
      { id: 'sliding-window', title: 'Sliding window', added: true },
      { id: 'monotonic-stack', title: 'Monotonic stack', added: true },
      { id: 'monotonic-queue', title: 'Monotonic queue (sliding window maximum)', added: true },
    ],
  },
  {
    name: 'Greedy algorithms',
    pathways: ['algorithms'],
    items: [
      { id: 'activity-selection', title: 'Activity selection', added: true },
      { id: 'interval-partitioning', title: 'Interval partitioning', added: true },
      { id: 'fractional-knapsack', title: 'Fractional knapsack', added: true },
    ],
  },
  {
    name: 'Divide and conquer',
    pathways: ['algorithms'],
    items: [
      { id: 'karatsuba', title: 'Karatsuba multiplication', added: true },
      { id: 'fft', title: 'Fast Fourier transform', added: true, advanced: true },
      { id: 'strassen', title: 'Strassen matrix multiplication', added: true },
    ],
  },
  {
    name: 'Number theory',
    pathways: ['algorithms'],
    items: [
      { id: 'euclid', title: 'Euclid and extended Euclid', added: true },
      { id: 'mod-pow', title: 'Fast modular exponentiation', added: true },
      { id: 'sieve', title: 'Sieve of Eratosthenes', added: true },
      { id: 'rsa', title: 'RSA', added: true, advanced: true },
    ],
  },
  {
    name: 'Randomized algorithms',
    pathways: ['algorithms'],
    items: [
      { id: 'fisher-yates', title: 'Fisher-Yates shuffle', added: true },
      { id: 'reservoir-sampling', title: 'Reservoir sampling', added: true },
      { id: 'karger-min-cut', title: "Karger's min cut", added: true, advanced: true },
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
  {
    // PLAN.md section 13: wave 5A, then 5B; 5C is advanced.
    name: 'Automata and computability',
    pathways: ['computation'],
    items: [
      { id: 'dfa', title: 'Deterministic finite automaton (DFA)', added: true },
      { id: 'nfa', title: 'Nondeterministic finite automaton (NFA)', added: true },
      { id: 'nfa-to-dfa', title: 'NFA to DFA (subset construction)', added: true },
      { id: 'dfa-minimization', title: 'DFA minimization', added: true },
      { id: 'regex-to-nfa', title: 'Regular expression to NFA', added: true },
      { id: 'turing-machine', title: 'Turing machine', added: true },
      { id: 'pda', title: 'Pushdown automaton', added: true },
      { id: 'cfg-derivation', title: 'Grammars, derivations and parse trees', added: true },
      { id: 'cyk', title: 'CYK parsing', added: true },
      { id: 'chomsky-hierarchy', title: 'The Chomsky hierarchy', added: true },
      { id: 'dfa-to-regex', title: 'DFA to regular expression', added: true, advanced: true },
      {
        id: 'product-construction',
        title: 'Union and intersection of DFAs',
        added: true,
        advanced: true,
      },
      { id: 'pumping-lemma', title: 'The pumping lemma game', added: true, advanced: true },
      { id: 'mealy-moore', title: 'Mealy and Moore machines', added: true, advanced: true },
      { id: 'multitape-tm', title: 'Multi-tape Turing machine', added: true, advanced: true },
      { id: 'halting-problem', title: 'The halting problem', added: true, advanced: true },
      {
        id: 'regex-engines',
        title: 'Regex engines: backtracking vs NFA',
        added: true,
        advanced: true,
      },
      { id: 'cfg-to-cnf', title: 'CFG to Chomsky normal form', added: true },
      { id: 'll1-parsing', title: 'LL(1) parsing', added: true },
      { id: 'lr0-parsing', title: 'LR(0) parsing', added: true, advanced: true },
      { id: 'lba', title: 'Linear-bounded automaton', added: true, advanced: true },
      { id: 'rice-theorem', title: "Rice's theorem", added: true, advanced: true },
      { id: 'myhill-nerode', title: 'Myhill-Nerode theorem', added: true, advanced: true },
      {
        id: 'regex-derivatives',
        title: 'Regular expression derivatives',
        added: true,
        advanced: true,
      },
      {
        id: 'post-correspondence',
        title: 'Post correspondence problem',
        added: true,
        advanced: true,
      },
      { id: 'busy-beaver', title: 'Busy beaver', added: true, advanced: true },
    ],
  },
  // PLAN.md section 20: wave 9, AI and LLMs. Tier 3 is marked advanced.
  {
    name: 'Tokenization',
    pathways: ['ai'],
    items: [
      { id: 'bpe-tokenizer', title: 'Byte-pair encoding (BPE)', added: true },
      { id: 'wordpiece', title: 'WordPiece tokenizer', added: true },
      { id: 'unigram-tokenizer', title: 'Unigram tokenizer (Viterbi split)', added: true },
    ],
  },
  {
    name: 'Language models and decoding',
    pathways: ['ai'],
    items: [
      { id: 'ngram-lm', title: 'N-gram language model', added: true },
      { id: 'sampling', title: 'Sampling: temperature, top-k, top-p', added: true },
      { id: 'beam-search', title: 'Beam search', added: true },
      { id: 'speculative-decoding', title: 'Speculative decoding', added: true },
      { id: 'constrained-decoding', title: 'Constrained decoding with a DFA', added: true },
      { id: 'rnn-lstm', title: 'Recurrent networks (RNN and LSTM)', added: true, advanced: true },
      { id: 'mcts', title: 'Monte Carlo tree search', added: true, advanced: true },
    ],
  },
  {
    name: 'Inside the transformer',
    pathways: ['ai'],
    items: [
      { id: 'embeddings', title: 'Embeddings and similarity', added: true },
      { id: 'self-attention', title: 'Self-attention', added: true },
      { id: 'multi-head-attention', title: 'Multi-head attention (and GQA)', added: true },
      { id: 'positional-encoding', title: 'Positional encoding (sinusoidal, RoPE)', added: true },
      { id: 'transformer-block', title: 'The transformer block', added: true },
      { id: 'moe-routing', title: 'Mixture-of-experts routing', added: true },
    ],
  },
  {
    name: 'Training',
    pathways: ['ai'],
    items: [
      { id: 'backpropagation', title: 'Backpropagation', added: true },
      { id: 'gradient-descent', title: 'Gradient descent (momentum, Adam)', added: true },
      { id: 'word2vec', title: 'word2vec (skip-gram)', added: true, advanced: true },
      {
        id: 'policy-optimization',
        title: 'Policy optimization (PPO, GRPO, DPO)',
        added: true,
        advanced: true,
      },
      { id: 'lora', title: 'LoRA (low-rank adapters)', added: true, advanced: true },
      { id: 'ring-allreduce', title: 'Ring all-reduce', added: true, advanced: true },
    ],
  },
  {
    name: 'Serving LLMs',
    pathways: ['ai'],
    items: [
      { id: 'kv-cache', title: 'KV cache', added: true },
      { id: 'paged-attention', title: 'Paged KV cache (PagedAttention)', added: true },
      { id: 'continuous-batching', title: 'Continuous batching', added: true },
      { id: 'quantization', title: 'Quantization (int8, int4)', added: true },
      { id: 'prefix-cache', title: 'Prefix cache (radix tree)', added: true, advanced: true },
      {
        id: 'flash-attention',
        title: 'FlashAttention (online softmax)',
        added: true,
        advanced: true,
      },
    ],
  },
  {
    name: 'Retrieval and vector search',
    pathways: ['ai'],
    items: [
      { id: 'k-means', title: 'k-means clustering', added: true },
      { id: 'bm25', title: 'Inverted index and BM25', added: true },
      { id: 'hnsw', title: 'HNSW graph search', added: true },
      { id: 'ivf-index', title: 'IVF index', added: true, advanced: true },
      { id: 'product-quantization', title: 'Product quantization', added: true, advanced: true },
    ],
  },
];

export const isLive = (id: string): boolean => liveIds.includes(id);

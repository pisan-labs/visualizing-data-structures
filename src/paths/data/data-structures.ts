import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'data-structures',
  title: 'A first data structures course',
  audience: 'Students taking (or retaking) data structures',
  blurb: 'Arrays to graphs in 19 pages, in the order most courses teach them.',
  intro:
    'This is roughly the order a first data structures course follows. Each step is ' +
    'one page. Play the suggested example, read the lessons, and answer the checks; the step ' +
    'is done when every lesson is read and every check is right. Skip around if you like. ' +
    'The path keeps track either way.',
  stages: [
    {
      title: 'Before the structures',
      steps: [
        {
          viz: 'memory-model',
          example: 'reassign-vs-mutate',
          note: 'Every structure here is values and references. Get this wrong and linked lists will hurt.',
        },
        {
          viz: 'big-o-lab',
          example: 'quadratic-wall',
          note: 'Why we care about O(n) against O(n²): at a million items, a millisecond against 17 minutes.',
        },
      ],
    },
    {
      title: 'Lines of things',
      steps: [
        {
          viz: 'dynamic-array',
          example: 'amortized',
          note: 'The array that grows. Doubling makes append cheap on average, even though some appends copy everything.',
        },
        {
          viz: 'stack-array',
          example: 'lifo',
          note: 'Last in, first out, with an array and one integer.',
        },
        {
          viz: 'queue-array',
          example: 'wraparound',
          note: 'First in, first out. The trick is letting the front wrap around the end.',
        },
        {
          viz: 'linked-list',
          example: 'head-order',
          note: 'Nodes and next pointers. Insert at the head is O(1); finding anything is O(n).',
        },
        {
          viz: 'doubly-linked-list',
          example: 'four-updates',
          note: 'A pointer back as well. Count the four pointers that change on every insert.',
        },
      ],
    },
    {
      title: 'Trees',
      steps: [
        {
          viz: 'binary-tree',
          example: 'four-orders',
          note: 'Preorder, inorder, postorder and level order on the same tree.',
        },
        {
          viz: 'bst',
          example: 'delete-two-children',
          note: 'Smaller to the left, larger to the right. Delete is the hard case, so start there.',
        },
        {
          viz: 'avl',
          example: 'sorted-input',
          note: 'Sorted input turns a plain BST into a list. Rotations keep this one short.',
        },
      ],
    },
    {
      title: 'Heaps and hashing',
      steps: [
        {
          viz: 'binary-heap',
          example: 'build-bottom-up',
          note: 'A tree stored in an array. Building it bottom-up is O(n), which surprises most people.',
        },
        {
          viz: 'hash-chaining',
          example: 'collisions',
          note: 'Two keys, one bucket. Chaining keeps a list in each one.',
        },
        {
          viz: 'hash-open',
          example: 'primary-clustering',
          note: 'No lists: probe for the next free slot, and watch the clusters grow.',
        },
        {
          viz: 'hash-rehash',
          example: 'doubling',
          note: 'Past a load factor the table grows and every key moves. Watch what a power-of-2 size does to these keys.',
        },
      ],
    },
    {
      title: 'Graphs',
      steps: [
        {
          viz: 'graph-representations',
          example: 'sparse',
          note: 'Adjacency matrix or adjacency list. Most graphs you meet are sparse, so mostly lists.',
        },
        {
          viz: 'bfs',
          example: 'layers',
          note: 'A queue visits the graph one layer at a time, so it finds fewest-edge paths.',
        },
        {
          viz: 'dfs',
          example: 'stack-order',
          note: 'Swap the queue for a stack (or recursion) and you go deep first.',
        },
        {
          viz: 'dijkstra',
          example: 'closest-first',
          note: 'BFS with weights: a priority queue picks the closest vertex next.',
        },
        {
          viz: 'disjoint-sets',
          example: 'compression',
          note: 'Union and find, nearly O(1) each. You will need it for Kruskal.',
        },
      ],
    },
  ],
};

export default path;

import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'algorithms',
  title: 'An algorithms course',
  audience: 'Students in a first algorithms course',
  blurb: 'Sorting, divide and conquer, greedy, dynamic programming and graphs in 20 pages.',
  intro:
    'An algorithms course is mostly a handful of ideas used over and over: split the problem, ' +
    'make the obvious choice, remember what you already worked out. Each step is one page. ' +
    'Play the suggested example, read the lessons, and answer the checks; the step is done when ' +
    'every lesson is read and every check is right. If a data structure on the way is new to ' +
    'you, the data structures path has it.',
  stages: [
    {
      title: 'Counting the cost',
      steps: [
        {
          viz: 'loop-counting',
          example: 'triangle',
          note: 'Count the steps of a loop inside a loop. The triangle is where n²/2 comes from.',
        },
        {
          viz: 'master-theorem',
          example: 'merge-sort',
          note: 'T(n) = 2T(n/2) + n, drawn as a tree. You will see this recurrence all term.',
        },
      ],
    },
    {
      title: 'Sorting and searching',
      steps: [
        {
          viz: 'binary-search',
          example: 'lower-bound',
          note: 'Halve the range each time. The off-by-one mistakes live in the variants, so start with lower bound.',
        },
        {
          viz: 'insertion-sort',
          example: 'nearly-sorted',
          note: 'O(n²) in the worst case and close to O(n) on nearly sorted input. Both matter.',
        },
        {
          viz: 'merge-sort',
          example: 'top-down',
          note: 'Split in half, sort each half, merge. O(n log n) every time, at the cost of extra space.',
        },
        {
          viz: 'quick-sort',
          example: 'sorted-worst',
          note: 'Usually the fastest in practice. Here is the input that makes a bad pivot rule O(n²).',
        },
        {
          viz: 'counting-sort',
          example: 'stable',
          note: 'No comparisons, so the n log n lower bound does not apply. It needs small keys.',
        },
      ],
    },
    {
      title: 'Divide and conquer, and greedy',
      steps: [
        {
          viz: 'quickselect',
          example: 'median',
          note: 'Quicksort that only follows one side: the median in O(n) on average.',
        },
        {
          viz: 'karatsuba',
          example: 'three-products',
          note: 'Three multiplications instead of four, and the running time drops below n².',
        },
        {
          viz: 'activity-selection',
          example: 'shortest-fails',
          note: 'Greedy works when you pick the right rule. Shortest first is the wrong one.',
        },
        {
          viz: 'huffman',
          example: 'abracadabra',
          note: 'Merge the two rarest symbols, again and again. The result is an optimal prefix code.',
        },
      ],
    },
    {
      title: 'Dynamic programming',
      steps: [
        {
          viz: 'fibonacci-calls',
          example: 'explosion',
          note: 'The same calls over and over. This is the problem dynamic programming solves.',
        },
        {
          viz: 'dp-change',
          example: 'greedy-fails',
          note: 'Greedy change-making fails for some coin sets. The table does not.',
        },
        {
          viz: 'dp-lcs',
          example: 'row-by-row',
          note: 'A two-dimensional table filled row by row, then walked backwards for the answer.',
        },
        {
          viz: 'dp-knapsack',
          example: 'greedy-fails',
          note: 'Take it or leave it, for every item and every capacity.',
        },
      ],
    },
    {
      title: 'Graph algorithms',
      steps: [
        {
          viz: 'topo-indegree',
          example: 'paths-dag',
          note: 'Order tasks so every arrow points forward, by removing vertices with nothing coming in.',
        },
        {
          viz: 'dijkstra',
          example: 'negative-edge',
          note: 'Shortest paths, closest first. It assumes no negative edges, and this example shows why.',
        },
        {
          viz: 'bellman-ford',
          example: 'negative-cycle',
          note: 'Slower, but it handles negative edges and tells you when a negative cycle exists.',
        },
        {
          viz: 'kruskal',
          example: 'lightest-first',
          note: 'Minimum spanning tree: take the lightest edge that does not make a cycle.',
        },
        {
          viz: 'max-flow',
          example: 'take-flow-back',
          note: 'Push flow along paths, and push it back when a better route turns up.',
        },
      ],
    },
  ],
};

export default path;

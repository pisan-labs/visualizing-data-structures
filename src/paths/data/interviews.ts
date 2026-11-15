import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'interviews',
  title: 'Coding interview prep',
  audience: 'Anyone preparing for technical interviews',
  blurb: 'The patterns behind most interview problems, in 19 pages, starting with a map.',
  intro:
    'Most interview problems are a few patterns in disguise. The trick is spotting which one, ' +
    'so the path starts with a map of problem cues and the pattern each one points to. Each ' +
    'step after that is one pattern. Play the suggested example, read the lessons, and answer ' +
    'the checks; the step is done when every lesson is read and every check is right. Then try ' +
    'the practice questions, since that is closest to the real thing. If you have two weeks, ' +
    'do a stage every two or three days.',
  stages: [
    {
      title: 'Start with the map',
      steps: [
        {
          viz: 'pattern-map',
          example: 'whole-map',
          note: 'Problem cues on one side, patterns on the other. Come back to it after each stage.',
        },
      ],
    },
    {
      title: 'Arrays and strings',
      steps: [
        {
          viz: 'two-pointers',
          example: 'find-pair',
          note: 'A sorted array and two indices walking towards each other: O(n) instead of O(n²).',
        },
        {
          viz: 'sliding-window',
          example: 'grow-and-shrink',
          note: 'Grow the window on the right, shrink it on the left. Each index moves at most n times.',
        },
        {
          viz: 'prefix-sum-hashmap',
          example: 'count-with-negatives',
          note: 'Subarrays that sum to k, with negative numbers. A sliding window cannot do this one.',
        },
        {
          viz: 'frequency-counting',
          example: 'count-signatures',
          note: 'Count letters in a hash map. Anagrams, first unique character and friends.',
        },
        {
          viz: 'monotonic-stack',
          example: 'next-greater',
          note: 'Next greater element in one pass. Each value is pushed and popped once.',
        },
      ],
    },
    {
      title: 'Lists, intervals and heaps',
      steps: [
        {
          viz: 'fast-slow-pointers',
          example: 'odd-middle',
          note: 'One pointer moves twice as fast. The middle of a list without counting it first.',
        },
        {
          viz: 'merge-intervals',
          example: 'sort-then-merge',
          note: 'Sort by start, then one pass. Most interval problems start this way.',
        },
        {
          viz: 'top-k',
          example: 'best-three',
          note: 'Keep a heap of size k: O(n log k), and it works on a stream.',
        },
        {
          viz: 'k-way-merge',
          example: 'three-lists',
          note: 'A heap holds the head of every list, so the smallest is always on top.',
        },
      ],
    },
    {
      title: 'Search and backtracking',
      steps: [
        {
          viz: 'binary-search-answer',
          example: 'ship-in-three-days',
          note: 'Binary search over the answer, not the array. Look for "smallest value that works".',
        },
        {
          viz: 'state-space-bfs',
          example: 'three-wheels',
          note: 'Fewest moves means BFS. The vertices are states of the puzzle, not cells of a grid.',
        },
        {
          viz: 'combination-sum',
          example: 'sort-and-prune',
          note: 'Try a choice, recurse, undo it. Sorting first lets you stop early.',
        },
      ],
    },
    {
      title: 'Dynamic programming',
      steps: [
        {
          viz: 'dp-grid-paths',
          example: 'count-with-walls',
          note: 'Each cell from the cell above and the cell to its left. The gentlest DP there is.',
        },
        {
          viz: 'dp-lis',
          example: 'patience',
          note: 'Longest increasing subsequence in O(n log n), with piles of cards.',
        },
        {
          viz: 'dp-state-machine',
          example: 'cooldown-sell-early',
          note: 'Buy and sell problems: a few states per day and the moves between them.',
        },
      ],
    },
    {
      title: 'Design a data structure',
      steps: [
        {
          viz: 'lru-cache',
          example: 'hit-moves-to-front',
          note: 'A hash map and a doubly linked list, for O(1) get and put. Asked everywhere.',
        },
        {
          viz: 'min-stack',
          example: 'mins-on-the-side',
          note: 'The minimum in O(1): keep a second stack of minimums.',
        },
        {
          viz: 'rate-limiter',
          example: 'bucket-refills',
          note: 'A system design favourite. Compare a token bucket with a fixed window.',
        },
      ],
    },
  ],
};

export default path;

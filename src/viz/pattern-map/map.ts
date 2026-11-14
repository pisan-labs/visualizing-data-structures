/**
 * The pattern map's data: families of patterns, the cues that point to each pattern, and our
 * own problem statements with the cues they contain.
 *
 * - A NODE is a pattern (every entry of PATTERNS in src/viz/_patterns/patterns.ts) or a
 *   Concurrency page. Its id is its page id; whether that page is live is read from the
 *   registry when the page is built (`isLive`), so a node for a page still being written is
 *   drawn and named but not linked, and starts linking by itself once the page exists.
 * - A FAMILY groups nodes the way a reader of a problem looks for them. Every family name is a
 *   catalog family. The nine live pages of other pathways that are patterns too (cycle
 *   detection, binary search, backtracking, bitmasks, union-find, topological sort, tries, the
 *   LRU cache and Dijkstra) sit with the family where a reader would look: cycle detection with
 *   the linked list tricks, for example. Their own catalog family is `home`.
 * - A CUE is a short phrase of our own that points to one node, with the reason.
 * - A PROBLEM is a short statement of ours. `finds` are the words in it that are cues, in the
 *   order they appear; a `trap` is a look-alike: words that look like another pattern's cue,
 *   with the reason they do not fit. Every other find points to the answer.
 *
 * Every statement and cue is ours: never a LeetCode problem's name, number or text.
 */
import { families as catalog, isLive } from '../catalog';
import { pattern, PATTERNS } from '../_patterns/kit';

export interface MapNode {
  id: string;
  /** Short, as a choice option shows it. Patterns use their PATTERNS name. */
  name: string;
  /** The page id: /<page>/. */
  page: string;
  /** 'pattern': the naive way against the pattern. 'sync': the trouble, and the fix. */
  kind: 'pattern' | 'sync';
  /** What the naive way does and costs (for 'sync': what goes wrong). */
  naive: string;
  /** What the pattern does and costs (for 'sync': the fix). */
  gain: string;
}

export interface MapFamily {
  /** A catalog family name, exactly. */
  name: string;
  /** One sentence: what the problems of this family look like. */
  about: string;
  /** Node ids in map order. */
  nodes: string[];
}

export interface Cue {
  id: string;
  node: string;
  /** The cue as the map shows it: a short phrase, lower case. */
  text: string;
  /** Why the cue calls for the pattern: one or two sentences. */
  why: string;
}

export interface Find {
  /** The words in the statement, exactly as written there. */
  words: string;
  cue: string;
  /** A look-alike: the cue points to another pattern, and `but` says why it does not fit. */
  trap?: boolean;
  but?: string;
}

export interface Problem {
  id: string;
  /** Two or three words, for narration and for finding it by name. */
  title: string;
  text: string;
  finds: Find[];
  /** The node the problem calls for: every find that is not a trap points to it. */
  answer: string;
  /** Neutral words from the statement (no cue), offered as wrong options in practice. */
  filler: string[];
  /** Patterns that look as if they fit: the first wrong options in practice. */
  near: string[];
  /** Patterns that would also solve it, never offered as wrong options. */
  alsoFits?: string[];
}

type NodeRow = Omit<MapNode, 'name' | 'page' | 'kind'>;

/** The patterns (names from PATTERNS) with what the naive way costs and what the pattern costs. */
const PATTERN_ROWS: NodeRow[] = [
  {
    id: 'prefix-sum-hashmap',
    naive: 'every pair of ends, O(n²)',
    gain: 'one pass with a map, O(n)',
  },
  { id: 'kadane', naive: 'every pair of ends, O(n²)', gain: 'extend or restart, O(n)' },
  {
    id: 'frequency-counting',
    naive: 'sort the letters, or rescan for each one',
    gain: 'one counting pass, O(n)',
  },
  {
    id: 'difference-array',
    naive: 'add to every cell, O(q·n)',
    gain: 'two writes per update and one pass, O(q + n)',
  },
  {
    id: 'dutch-flag',
    naive: 'count, then rewrite, two passes and a copy',
    gain: 'one pass, in place',
  },
  {
    id: 'cyclic-sort',
    naive: 'sort, then scan, O(n log n) or worse',
    gain: 'swap each value home, O(n)',
  },
  {
    id: 'matrix-traversal',
    naive: 'a grid of seen marks, or a rotated copy, n² extra cells',
    gain: 'four bounds, or swaps in place, O(1) extra',
  },
  { id: 'two-pointers', naive: 'every pair, O(n²)', gain: 'one index at each end, O(n)' },
  {
    id: 'sliding-window',
    naive: 'every stretch, O(n²)',
    gain: 'each value enters and leaves once, O(n)',
  },
  {
    id: 'monotonic-stack',
    naive: 'scan ahead from each value, O(n²)',
    gain: 'each value pushed and popped once, O(n)',
  },
  {
    id: 'monotonic-queue',
    naive: 'rescan each window, O(n·k)',
    gain: 'a deque kept in order, O(n)',
  },
  {
    id: 'merge-intervals',
    naive: 'check every pair, O(n²)',
    gain: 'sort by start, then one pass, O(n log n)',
  },
  {
    id: 'sweep-line',
    naive: 'check every interval at every point, O(n²)',
    gain: 'sort the 2n events, then one sweep, O(n log n)',
  },
  {
    id: 'fast-slow-pointers',
    naive: 'count the length first, or copy to an array',
    gain: 'one walk, O(1) extra space',
  },
  {
    id: 'floyd-cycle',
    naive: 'a set of visited nodes, O(n) extra space',
    gain: 'two speeds, O(1) extra space',
  },
  {
    id: 'merge-sorted-lists',
    naive: 'copy to an array, sort, rebuild',
    gain: 'relink with a dummy head, O(m + n)',
  },
  {
    id: 'reverse-k-group',
    naive: 'copy to an array, reverse, write back, O(n) extra',
    gain: 'relink in place, O(1) extra',
  },
  { id: 'top-k', naive: 'sort everything, O(n log n)', gain: 'a min-heap of size k, O(n log k)' },
  {
    id: 'k-way-merge',
    naive: 'concatenate and sort, O(n log n)',
    gain: 'a heap of the k fronts, O(n log k)',
  },
  {
    id: 'two-heaps-median',
    naive: 'a sorted list, O(n) per value',
    gain: 'two heaps, O(log n) per value',
  },
  {
    id: 'binary-search',
    naive: 'scan from the start, O(n)',
    gain: 'halve the range each step, O(log n)',
  },
  {
    id: 'binary-search-answer',
    naive: 'try every candidate answer in turn',
    gain: 'binary search over the answers, O(log range) checks',
  },
  {
    id: 'state-space-bfs',
    naive: 'try every sequence of moves, exponential in its length',
    gain: 'each state once, O(states + moves)',
  },
  {
    id: 'backtracking',
    naive: 'build every candidate, then test it',
    gain: 'grow one choice at a time and cut dead branches',
  },
  {
    id: 'combination-sum',
    naive: 'every combination, then check its total',
    gain: 'sorted candidates, and stop a branch once it passes the target',
  },
  {
    id: 'dijkstra',
    naive: 'try every path, exponentially many',
    gain: 'a priority queue, O((V + E) log V)',
  },
  {
    id: 'topo-indegree',
    naive: 'scan for a ready task again and again, O(V·(V + E))',
    gain: 'indegree counts and a queue, O(V + E)',
  },
  {
    id: 'disjoint-sets',
    naive: 'search the graph for each question, O(V + E) each',
    gain: 'union by rank and path compression, nearly O(1) each',
  },
  {
    id: 'xor-tricks',
    naive: 'count with a hash map, O(n) extra',
    gain: 'XOR everything, O(1) extra',
  },
  {
    id: 'bitmask',
    naive: 'an array of booleans for each set',
    gain: 'one integer per set, so every subset is a number',
  },
  {
    id: 'dp-grid-paths',
    naive: 'recursion without a memo, exponential',
    gain: 'one value per cell, O(rows · cols)',
  },
  {
    id: 'dp-state-machine',
    naive: 'try every action on every day, exponential',
    gain: 'a few states per day, O(n)',
  },
  {
    id: 'dp-interval',
    naive: 'try every order, n! of them',
    gain: 'every interval by its last step, O(n³)',
  },
  {
    id: 'dp-tree',
    naive: 'try every allowed subset, exponential',
    gain: 'two values per node, O(n)',
  },
  {
    id: 'dp-bitmask',
    naive: 'try every order, n! of them',
    gain: 'one value per subset, O(n · 2ⁿ)',
  },
  {
    id: 'min-stack',
    naive: 'scan the stack for the minimum, O(n)',
    gain: 'a second stack of minimums, O(1)',
  },
  {
    id: 'two-stack-queue',
    naive: 'pour everything across on every dequeue, O(n)',
    gain: 'pour only when the out-stack is empty, O(1) amortized',
  },
  {
    id: 'randomized-set',
    naive: 'an array removes in O(n); a set cannot pick at random',
    gain: 'an array plus an index map, all three O(1) on average',
  },
  {
    id: 'lru-cache',
    naive: 'a list scanned on every access, O(n)',
    gain: 'a hash map plus a doubly linked list, O(1)',
  },
  {
    id: 'lfu-cache',
    naive: 'scan every count to evict, O(n)',
    gain: 'a list per count and the smallest count, O(1)',
  },
  {
    id: 'rate-limiter',
    naive: 'keep every request time and recount the window each time',
    gain: 'a counter or a token bucket, O(1) per request',
  },
  {
    id: 'trie',
    naive: 'compare the prefix with every word',
    gain: 'one step per letter of the prefix',
  },
];

/** The Concurrency pages: what goes wrong, and the fix. */
const SYNC_ROWS: (NodeRow & { name: string })[] = [
  {
    id: 'race-condition',
    name: 'Race conditions',
    naive: 'load, add and store interleave, and an update is lost',
    gain: 'make the three steps one, with a lock or an atomic add',
  },
  {
    id: 'mutex',
    name: 'Mutex (lock)',
    naive: 'two threads in the critical section lose updates',
    gain: 'one thread at a time holds the lock',
  },
  {
    id: 'semaphore',
    name: 'Semaphores',
    naive: 'too many threads at once, or the wrong order',
    gain: 'a counter that makes threads wait at zero',
  },
  {
    id: 'producer-consumer',
    name: 'Producer-consumer',
    naive: 'busy waiting, or taking from an empty buffer',
    gain: 'a lock and two conditions, each wait in a loop',
  },
  {
    id: 'deadlock',
    name: 'Deadlock',
    naive: 'locks taken in any order make a cycle of waits',
    gain: 'one global lock order',
  },
  {
    id: 'dining-philosophers',
    name: 'Dining philosophers',
    naive: 'all take the left fork first, and deadlock',
    gain: 'one takes the right first, or a waiter seats n − 1',
  },
  {
    id: 'readers-writers',
    name: 'Readers and writers',
    naive: 'one lock for everyone, so readers wait for each other',
    gain: 'a read-write lock, where readers share and a writer is alone',
  },
  {
    id: 'barrier',
    name: 'Barriers',
    naive: 'a fast thread runs on into the next round',
    gain: 'the last to arrive lets everyone through',
  },
  {
    id: 'compare-and-swap',
    name: 'Compare-and-swap',
    naive: 'with a lock, a stalled holder blocks everyone',
    gain: 'retry until the swap succeeds, holding no lock',
  },
];

export const NODES: readonly MapNode[] = [
  ...PATTERN_ROWS.map((r) => {
    const p = pattern(r.id);
    return { ...r, name: p.name, page: p.page, kind: 'pattern' as const };
  }),
  ...SYNC_ROWS.map((r) => ({ ...r, page: r.id, kind: 'sync' as const })),
];

export const FAMILIES: readonly MapFamily[] = [
  {
    name: 'Array and string tricks',
    about: 'one pass over a list or a string, with a count, a running value or a swap',
    nodes: [
      'prefix-sum-hashmap',
      'kadane',
      'frequency-counting',
      'difference-array',
      'dutch-flag',
      'cyclic-sort',
      'matrix-traversal',
    ],
  },
  {
    name: 'Techniques',
    about: 'indices or a stack that move through an array once',
    nodes: ['two-pointers', 'sliding-window', 'monotonic-stack', 'monotonic-queue'],
  },
  {
    name: 'Intervals',
    about: 'start and end times, sorted first',
    nodes: ['merge-intervals', 'sweep-line'],
  },
  {
    name: 'Linked list tricks',
    about: 'pointers moved along a list, with no index to jump to',
    nodes: ['fast-slow-pointers', 'floyd-cycle', 'merge-sorted-lists', 'reverse-k-group'],
  },
  {
    name: 'Heap patterns',
    about: 'the best few of many, or the next smallest of several',
    nodes: ['top-k', 'k-way-merge', 'two-heaps-median'],
  },
  {
    name: 'Search templates',
    about: 'a space of answers or states, searched in a smart order',
    nodes: [
      'binary-search',
      'binary-search-answer',
      'state-space-bfs',
      'backtracking',
      'combination-sum',
    ],
  },
  {
    name: 'Graphs',
    about: 'things joined by links, such as routes, prerequisites and groups',
    nodes: ['dijkstra', 'topo-indegree', 'disjoint-sets'],
  },
  {
    name: 'Bit tricks',
    about: 'the bits of an integer as a set, or values that cancel',
    nodes: ['xor-tricks', 'bitmask'],
  },
  {
    name: 'DP patterns',
    about: 'a best or a count built from smaller answers you keep',
    nodes: ['dp-grid-paths', 'dp-state-machine', 'dp-interval', 'dp-tree', 'dp-bitmask'],
  },
  {
    name: 'Design a data structure',
    about: 'a few operations that must all be fast, usually two structures together',
    nodes: [
      'min-stack',
      'two-stack-queue',
      'randomized-set',
      'lru-cache',
      'lfu-cache',
      'rate-limiter',
      'trie',
    ],
  },
  {
    name: 'Concurrency',
    about: 'threads sharing memory, where the order of steps is not yours',
    nodes: [
      'race-condition',
      'mutex',
      'semaphore',
      'producer-consumer',
      'deadlock',
      'dining-philosophers',
      'readers-writers',
      'barrier',
      'compare-and-swap',
    ],
  },
];

const c = (id: string, node: string, text: string, why: string): Cue => ({ id, node, text, why });

/** Every cue, grouped by node in map order. */
export const CUES: readonly Cue[] = [
  // Array and string tricks
  c(
    'ps-count',
    'prefix-sum-hashmap',
    'count stretches with sum k',
    'A stretch’s sum is the difference of two running sums, so count the earlier running sums equal to the current one minus k.',
  ),
  c(
    'ps-negative',
    'prefix-sum-hashmap',
    'an exact sum, some negative',
    'Negative values break a sliding window, but a running sum does not care about signs.',
  ),
  c(
    'kd-best',
    'kadane',
    'the largest sum of a stretch',
    'There is no target to look up: carry the best sum of a stretch ending here, and start again when it drops below zero.',
  ),
  c(
    'fc-anagram',
    'frequency-counting',
    'same letters, any order',
    'Anagrams have the same letter counts, so 26 counts are a signature that groups them.',
  ),
  c(
    'fc-once',
    'frequency-counting',
    'the first one seen once',
    'One pass counts every item; a second finds the first whose count is 1.',
  ),
  c(
    'da-range',
    'difference-array',
    'add x to every cell l..r',
    'Write +x at l and −x at r + 1; one running sum at the end applies every update.',
  ),
  c(
    'da-many',
    'difference-array',
    'many updates, then one read',
    'Each update costs two writes, and the one pass of running sums is paid once.',
  ),
  c(
    'df-three',
    'dutch-flag',
    'three kinds, one pass',
    'Three indices keep four regions (below, equal, unknown, above), and each step shrinks the unknown one.',
  ),
  c(
    'df-pivot',
    'dutch-flag',
    'below, equal, above a pivot',
    'It is quicksort’s three-way partition, done in place in one pass.',
  ),
  c(
    'cs-range',
    'cyclic-sort',
    'the numbers 1 to n',
    'Each value names its own slot, so swap it home: every swap puts one value in place for good.',
  ),
  c(
    'cs-missing',
    'cyclic-sort',
    'missing and repeated in 1..n',
    'Once every value is home, one scan finds the slot holding the wrong value.',
  ),
  c(
    'mt-spiral',
    'matrix-traversal',
    'spiral order of a grid',
    'Keep four bounds, top, bottom, left and right, and pull one in after each side is walked.',
  ),
  c(
    'mt-rotate',
    'matrix-traversal',
    'rotate a square in place',
    'Turn it ring by ring, or transpose it and reverse each row: no copy needed.',
  ),
  // Techniques
  c(
    'tp-pair',
    'two-pointers',
    'a pair with sum k, sorted',
    'One index at each end: too small, move the left one in; too big, the right one. Each move rules out a row of pairs.',
  ),
  c(
    'tp-ends',
    'two-pointers',
    'compare from both ends',
    'Two indices walk in from the ends and meet in the middle, as in checking a palindrome.',
  ),
  c(
    'sw-limit',
    'sliding-window',
    'longest stretch under a cap',
    'With no negative values, growing a window raises its total and shrinking lowers it, so each value enters and leaves once.',
  ),
  c(
    'sw-distinct',
    'sliding-window',
    'no repeats in a stretch',
    'Keep counts of what is in the window, and shrink it from the left when something repeats.',
  ),
  c(
    'sw-every-k',
    'sliding-window',
    'the sum of every window of k',
    'Add the value that enters and subtract the one that leaves: O(1) per window.',
  ),
  c(
    'ms-next',
    'monotonic-stack',
    'the next greater value',
    'Keep a stack in order: each new value pops the smaller ones and is the answer for each one it pops.',
  ),
  c(
    'ms-rect',
    'monotonic-stack',
    'largest rectangle in bars',
    'A stack of rising bars: when a lower bar comes, each bar it pops knows how far it reached.',
  ),
  c(
    'mq-max',
    'monotonic-queue',
    'the maximum of every window',
    'A deque whose values decrease: its front is the window’s maximum, and values that can never win are dropped.',
  ),
  // Intervals
  c(
    'mi-overlap',
    'merge-intervals',
    'overlapping intervals',
    'Sort by start; each interval either reaches the last one out and merges with it, or starts a new one.',
  ),
  c(
    'mi-insert',
    'merge-intervals',
    'fit a new interval in',
    'The list is already sorted: copy the ones before it, merge the ones it touches, copy the rest.',
  ),
  c(
    'sl-most',
    'sweep-line',
    'the most open at once',
    'Turn each interval into a start and an end event, sort the events by time, and keep a count as you walk them.',
  ),
  c(
    'sl-outline',
    'sweep-line',
    'the outline of buildings',
    'Sweep the starts and ends with a max-heap of the heights still standing; the outline changes when the top does.',
  ),
  // Linked list tricks
  c(
    'fs-middle',
    'fast-slow-pointers',
    'the middle of a list',
    'One pointer moves two nodes for each one the other moves; when the fast one reaches the end, the slow one is halfway.',
  ),
  c(
    'fs-kth',
    'fast-slow-pointers',
    'k-th node from the end',
    'Start one pointer k nodes ahead, then move both: when the lead reaches the end, the other is k behind it.',
  ),
  c(
    'cy-loop',
    'floyd-cycle',
    'does the list loop back?',
    'A pointer moving twice as fast catches the slow one exactly when there is a cycle.',
  ),
  c(
    'cy-start',
    'floyd-cycle',
    'where the loop begins',
    'After they meet, start one pointer again at the head and move both one step at a time: they meet where the cycle starts.',
  ),
  c(
    'ml-two',
    'merge-sorted-lists',
    'two sorted lists into one',
    'A dummy head and a tail: take the smaller front node each time and relink it.',
  ),
  c(
    'rk-groups',
    'reverse-k-group',
    'reverse every k nodes',
    'Keep the node before each group, flip the group’s links with three pointers, and join it back.',
  ),
  c(
    'rk-part',
    'reverse-k-group',
    'reverse part of a list',
    'The same three pointers flip one stretch of links; no value is copied.',
  ),
  // Heap patterns
  c(
    'tk-largest',
    'top-k',
    'the k largest',
    'Keep the best k so far in a min-heap: a new value gets in only if it beats the root, the k-th largest so far.',
  ),
  c(
    'tk-memory',
    'top-k',
    'only k fit in memory',
    'A heap of size k is all a stream needs; sorting needs every value at once.',
  ),
  c(
    'tk-kth',
    'top-k',
    'the k-th smallest value',
    'A max-heap of the k smallest has it on top; with every value in hand, quickselect finds it in O(n) on average.',
  ),
  c(
    'kw-merge',
    'k-way-merge',
    'merge k sorted lists',
    'A min-heap holds each list’s front value, and its root is always the next value out.',
  ),
  c(
    'th-median',
    'two-heaps-median',
    'a running median',
    'A max-heap holds the low half and a min-heap the high half; the median sits on their tops.',
  ),
  c(
    'th-halves',
    'two-heaps-median',
    'a low half and a high half',
    'Two heaps, kept within one value of each other in size, split the values at the middle.',
  ),
  // Search templates
  c(
    'bs-sorted',
    'binary-search',
    'find x in a sorted array',
    'Look in the middle and throw away the half that cannot hold x.',
  ),
  c(
    'bs-first',
    'binary-search',
    'the first index that works',
    'When a test is false and then true along the array, binary search finds where it turns.',
  ),
  c(
    'ba-least',
    'binary-search-answer',
    'the smallest k that works',
    'If k works, every larger k works too, so binary search over k, with a check that runs over the whole input.',
  ),
  c(
    'ba-gap',
    'binary-search-answer',
    'make the smallest gap large',
    'Guess a gap and check greedily whether it can be met; the gaps that pass form a range, so search for its end.',
  ),
  c(
    'sb-fewest',
    'state-space-bfs',
    'fewest moves between states',
    'Each state is a vertex and each move an edge, made as you go: BFS reaches the states in order of distance.',
  ),
  c(
    'sb-moves',
    'state-space-bfs',
    'a puzzle with legal moves',
    'The states are not stored as a graph, but the moves from a state can be listed, and that is all BFS needs.',
  ),
  c(
    'bt-subsets',
    'backtracking',
    'list every subset',
    'Choose, explore, unchoose: each item is in or out, one branch each.',
  ),
  c(
    'bt-orders',
    'backtracking',
    'every order of n items',
    'Each level of the tree picks the next item from those not used yet.',
  ),
  c(
    'cb-target',
    'combination-sum',
    'combinations adding up to t',
    'Backtrack over the candidates in sorted order, and stop a branch as soon as its total passes t.',
  ),
  c(
    'cb-reuse',
    'combination-sum',
    'values may be used again',
    'A branch may pick the same value again but never an earlier one, so each combination appears once.',
  ),
  // Graphs
  c(
    'dj-cheapest',
    'dijkstra',
    'the cheapest route by road',
    'Settle the closest unsettled vertex from a priority queue; with no negative lengths its distance is final.',
  ),
  c(
    'to-before',
    'topo-indegree',
    'a task needs others first',
    'Count the arrows into each task, and take the tasks with none left, one at a time.',
  ),
  c(
    'to-cycle',
    'topo-indegree',
    'do the rules go in a circle?',
    'If tasks remain but none is ready, the rules that are left form a cycle.',
  ),
  c(
    'ds-connected',
    'disjoint-sets',
    'are these two connected?',
    'Each group is a tree: find walks up to its root, and two items are connected when their roots match.',
  ),
  c(
    'ds-merge',
    'disjoint-sets',
    'merge groups as links arrive',
    'Union links two roots; with union by rank and path compression each operation is nearly O(1).',
  ),
  // Bit tricks
  c(
    'xr-pairs',
    'xor-tricks',
    'every value twice but one',
    'x ^ x = 0 and x ^ 0 = x: XOR everything and the pairs cancel, leaving the single one.',
  ),
  c(
    'xr-two',
    'xor-tricks',
    'two values appear once',
    'XOR them all to get a ^ b, then split the values by a bit where a and b differ.',
  ),
  c(
    'bm-flags',
    'bitmask',
    'a set of on/off flags',
    'One integer holds the set, a bit per item: testing, setting and clearing a bit are one operation each.',
  ),
  c(
    'bm-ones',
    'bitmask',
    'count the 1 bits',
    'x & (x − 1) clears the lowest 1 bit, so the loop runs once per 1 bit.',
  ),
  // DP patterns
  c(
    'dg-right',
    'dp-grid-paths',
    'only right or down',
    'A cell is reached only from the left or from above, so its count is the sum of theirs.',
  ),
  c(
    'dg-walls',
    'dp-grid-paths',
    'cheapest path around walls',
    'A wall gets no value; every other cell takes the cheaper of its two neighbours plus its own cost.',
  ),
  c(
    'dm-day',
    'dp-state-machine',
    'each day: hold, sell or rest',
    'Name the states you can be in at the end of a day; each one’s best comes from yesterday’s states.',
  ),
  c(
    'dm-rule',
    'dp-state-machine',
    'a rule about the day before',
    'A cooldown or a fee is a move between states, so it costs one more state, not a new search.',
  ),
  c(
    'di-merge',
    'dp-interval',
    'best order to merge a row',
    'Solve every interval by the step that happens last in it: two smaller intervals, already solved.',
  ),
  c(
    'di-neighbors',
    'dp-interval',
    'cost depends on neighbours',
    'Removing an item changes who sits next to whom, so solve by the item removed last, whose neighbours are the interval’s ends.',
  ),
  c(
    'dt-parent',
    'dp-tree',
    'never a node with its parent',
    'Two values per node, taken or skipped, filled in from the leaves up.',
  ),
  c(
    'db-assign',
    'dp-bitmask',
    'give n tasks to n workers',
    'A DP over the set of tasks already given out: one bitmask per set, 2ⁿ of them.',
  ),
  c(
    'db-small',
    'dp-bitmask',
    'n at most about 20',
    '2ⁿ is about a million at n = 20, small enough to visit every subset, where n! is not.',
  ),
  // Design a data structure
  c(
    'mn-min',
    'min-stack',
    'a stack that knows its min',
    'Push the minimum so far onto a second stack beside each value; a pop brings back the old minimum.',
  ),
  c(
    'tq-queue',
    'two-stack-queue',
    'a queue built from stacks',
    'Push onto one stack and pop from the other, pouring the first into it only when it is empty.',
  ),
  c(
    'rs-random',
    'randomized-set',
    'insert, delete, random: O(1)',
    'An array gives the random pick, a map from value to index finds a value, and a remove swaps it with the last.',
  ),
  c(
    'lr-evict',
    'lru-cache',
    'drop the least recently used',
    'A hash map finds the entry, and a doubly linked list keeps the entries in order of use.',
  ),
  c(
    'lf-evict',
    'lfu-cache',
    'drop the least often used',
    'Keep a list of keys for each use count, and the smallest count; ties go to the least recently used.',
  ),
  c(
    'rl-limit',
    'rate-limiter',
    'at most r per second',
    'Count the requests in a fixed window, a sliding log, or a token bucket that refills at the allowed rate.',
  ),
  c(
    'tr-prefix',
    'trie',
    'words with a given prefix',
    'Words that share a prefix share a path, so a query costs one step per letter.',
  ),
  c(
    'tr-type',
    'trie',
    'suggest as you type',
    'Each letter typed moves one step down the tree; the words below are the suggestions.',
  ),
  // Concurrency
  c(
    'rc-counter',
    'race-condition',
    'two threads, one counter',
    'count = count + 1 is load, add and store, and another thread can run between them.',
  ),
  c(
    'rc-short',
    'race-condition',
    'a total that comes up short',
    'A lost update: two threads read the same old value, and both write back old + 1.',
  ),
  c(
    'mx-one',
    'mutex',
    'one thread at a time',
    'A lock around the critical section: whoever holds it runs, and the others wait in line.',
  ),
  c(
    'sm-k',
    'semaphore',
    'at most k at once',
    'A counting semaphore starts at k: P takes one and waits at zero, V gives one back.',
  ),
  c(
    'sm-turns',
    'semaphore',
    'threads take turns',
    'A semaphore at 0 makes a thread wait until another signals it, which forces the order.',
  ),
  c(
    'pc-full',
    'producer-consumer',
    'wait for room in a buffer',
    'A lock and two condition variables, not full and not empty, with each wait in a while loop.',
  ),
  c(
    'pc-queue',
    'producer-consumer',
    'workers pull from a queue',
    'The queue is a bounded buffer: producers wait when it is full, consumers when it is empty.',
  ),
  c(
    'dl-order',
    'deadlock',
    'two locks, opposite orders',
    'Each thread holds one lock and waits for the other’s: a cycle in the wait-for graph.',
  ),
  c(
    'dl-forever',
    'deadlock',
    'both wait for ever',
    'No thread can move, and none ever will. One global lock order makes the cycle impossible.',
  ),
  c(
    'ph-forks',
    'dining-philosophers',
    'each needs both neighbours',
    'If all take the left fork first, they wait in a circle. Let one take the right first, or let at most n − 1 sit.',
  ),
  c(
    'rw-many',
    'readers-writers',
    'many readers or one writer',
    'A read-write lock lets readers share; a writer waits until it is alone.',
  ),
  c(
    'br-all',
    'barrier',
    'wait until all n arrive',
    'A count of arrivals and a semaphore: the last thread to arrive lets everyone through.',
  ),
  c(
    'br-round',
    'barrier',
    'no peeking at the next round',
    'A barrier between rounds: no thread reads round r + 1 before every thread has written round r.',
  ),
  c(
    'cw-nolock',
    'compare-and-swap',
    'update without a lock',
    'Read the value, compute the new one, and swap it in only if nobody changed it meanwhile; else retry.',
  ),
  c(
    'cw-aba',
    'compare-and-swap',
    'it changed and changed back',
    'Compare-and-swap sees the old value and succeeds anyway: the ABA problem. A version number beside the value catches it.',
  ),
];

/** Our own problem statements, one or two per family. */
export const PROBLEMS: readonly Problem[] = [
  {
    id: 'river-levels',
    title: 'river levels',
    text: 'A gauge logs how far a river rose or fell each hour. Count the stretches of consecutive hours over which it rose by exactly 30 cm.',
    finds: [
      { words: 'rose or fell', cue: 'ps-negative' },
      { words: 'Count the stretches of consecutive hours', cue: 'ps-count' },
    ],
    answer: 'prefix-sum-hashmap',
    filler: ['A gauge logs', 'each hour'],
    near: ['sliding-window', 'kadane', 'difference-array'],
  },
  {
    id: 'warmest-block',
    title: 'warmest block',
    text: 'A thermometer reads once a minute. For every block of 10 minutes in a row, report the highest reading in it.',
    finds: [
      {
        words: 'every block of 10 minutes in a row',
        cue: 'sw-every-k',
        trap: true,
        but: 'a window keeps a sum up to date by subtracting what leaves, and a maximum cannot be subtracted',
      },
      { words: 'the highest reading in it', cue: 'mq-max' },
    ],
    answer: 'monotonic-queue',
    filler: ['A thermometer reads', 'once a minute'],
    near: ['sliding-window', 'top-k', 'monotonic-stack'],
  },
  {
    id: 'hall-bookings',
    title: 'hall bookings',
    text: 'A hall takes bookings, each with a start and an end time, and some of them overlap. What is the largest number of bookings in progress at the same moment?',
    finds: [
      {
        words: 'some of them overlap',
        cue: 'mi-overlap',
        trap: true,
        but: 'merging says which bookings overlap and forgets how many are open at once',
      },
      { words: 'the largest number of bookings in progress at the same moment', cue: 'sl-most' },
    ],
    answer: 'sweep-line',
    filler: ['A hall takes bookings', 'a start and an end time'],
    near: ['merge-intervals', 'two-heaps-median', 'top-k'],
    alsoFits: ['difference-array'],
  },
  {
    id: 'halfway-node',
    title: 'halfway node',
    text: 'A singly linked list of unknown length. Find the node halfway along it, in one walk and without counting first.',
    finds: [{ words: 'Find the node halfway along it', cue: 'fs-middle' }],
    answer: 'fast-slow-pointers',
    filler: ['A singly linked list', 'of unknown length'],
    near: ['floyd-cycle', 'binary-search', 'two-pointers'],
  },
  {
    id: 'largest-orders',
    title: 'largest orders',
    text: 'A shop takes a million orders a day. Keep the 10 largest orders seen so far, with memory for only those 10.',
    finds: [
      { words: 'Keep the 10 largest orders', cue: 'tk-largest' },
      { words: 'with memory for only those 10', cue: 'tk-memory' },
    ],
    answer: 'top-k',
    filler: ['A shop takes', 'a million orders a day'],
    near: ['two-heaps-median', 'k-way-merge', 'binary-search'],
  },
  {
    id: 'coin-flips',
    title: 'coin flips',
    text: 'A row of six coins, each heads or tails. One move flips two coins side by side. What is the fewest moves that make them all heads?',
    finds: [
      { words: 'One move flips two coins side by side', cue: 'sb-moves' },
      { words: 'the fewest moves', cue: 'sb-fewest' },
    ],
    answer: 'state-space-bfs',
    filler: ['A row of six coins', 'each heads or tails'],
    near: ['dijkstra', 'backtracking', 'dp-grid-paths'],
    alsoFits: ['bitmask'],
  },
  {
    id: 'recipe-steps',
    title: 'recipe steps',
    text: 'A recipe has steps, and some steps need others done first: the sauce before the pasta. Give an order for all the steps, or say that the rules go round in a circle.',
    finds: [
      { words: 'some steps need others done first', cue: 'to-before' },
      { words: 'the rules go round in a circle', cue: 'to-cycle' },
    ],
    answer: 'topo-indegree',
    filler: ['A recipe has steps', 'the sauce before the pasta'],
    near: ['dijkstra', 'disjoint-sets', 'backtracking'],
  },
  {
    id: 'lone-sensor',
    title: 'lone sensor',
    text: 'A log lists sensor IDs. Every ID shows up twice except one, which shows up once. Find it with constant extra memory.',
    finds: [
      { words: 'Every ID shows up twice except one', cue: 'xr-pairs' },
      {
        words: 'which shows up once',
        cue: 'fc-once',
        trap: true,
        but: 'counting needs a map as large as the log, and the memory must stay constant',
      },
    ],
    answer: 'xor-tricks',
    filler: ['A log lists sensor IDs', 'Find it'],
    near: ['frequency-counting', 'bitmask', 'cyclic-sort'],
  },
  {
    id: 'courier-routes',
    title: 'courier routes',
    text: 'A courier crosses a city grid from the north-west corner to the south-east one, only ever going east or south, and some blocks are closed. How many routes are there?',
    finds: [
      { words: 'only ever going east or south', cue: 'dg-right' },
      { words: 'some blocks are closed', cue: 'dg-walls' },
    ],
    answer: 'dp-grid-paths',
    filler: ['A courier crosses a city grid', 'the north-west corner'],
    near: ['state-space-bfs', 'dijkstra', 'backtracking'],
  },
  {
    id: 'cache-evict',
    title: 'cache eviction',
    text: 'A cache holds 100 entries. When it is full, drop the entry used the fewest times, and among those, the one used least recently.',
    finds: [
      { words: 'drop the entry used the fewest times', cue: 'lf-evict' },
      {
        words: 'the one used least recently',
        cue: 'lr-evict',
        trap: true,
        but: 'recency only breaks ties here: the main rule is how often an entry was used',
      },
    ],
    answer: 'lfu-cache',
    filler: ['A cache holds 100 entries', 'When it is full'],
    near: ['lru-cache', 'top-k', 'frequency-counting'],
  },
  {
    id: 'shared-total',
    title: 'shared total',
    text: 'Two threads each add 1 to a shared total a thousand times. On some runs the total ends below 2000. What went wrong?',
    finds: [
      { words: 'Two threads each add 1 to a shared total', cue: 'rc-counter' },
      { words: 'the total ends below 2000', cue: 'rc-short' },
    ],
    answer: 'race-condition',
    filler: ['a thousand times', 'On some runs'],
    near: ['deadlock', 'producer-consumer', 'barrier'],
    alsoFits: ['mutex', 'compare-and-swap'],
  },
  {
    id: 'bank-transfers',
    title: 'bank transfers',
    text: 'To move money, a thread locks the sender’s account and then the receiver’s. Two transfers between the same accounts run at once in opposite directions, and sometimes both stop for good.',
    finds: [
      {
        words: 'Two transfers between the same accounts run at once in opposite directions',
        cue: 'dl-order',
      },
      { words: 'both stop for good', cue: 'dl-forever' },
    ],
    answer: 'deadlock',
    filler: ['To move money', 'the receiver’s'],
    near: ['race-condition', 'dining-philosophers', 'semaphore'],
    alsoFits: ['mutex'],
  },
];

// ----- Lookups -----

const nodeById = new Map(NODES.map((n) => [n.id, n]));
const cueById = new Map(CUES.map((q) => [q.id, q]));

export function node(id: string): MapNode {
  const n = nodeById.get(id);
  if (!n) throw new Error(`No node "${id}" on the pattern map.`);
  return n;
}

export function cue(id: string): Cue {
  const q = cueById.get(id);
  if (!q) throw new Error(`No cue "${id}" on the pattern map.`);
  return q;
}

/** The index in FAMILIES of the family that holds a node. */
export function familyOf(nodeId: string): number {
  return FAMILIES.findIndex((f) => f.nodes.includes(nodeId));
}

/** The cues that point to a node, in map order. */
export const cuesOf = (nodeId: string): Cue[] => CUES.filter((q) => q.node === nodeId);

/** The cues of a family, grouped by node in the family's order. */
export const familyCues = (f: number): Cue[] => FAMILIES[f]!.nodes.flatMap(cuesOf);

/** The catalog family a node's page is listed in (its home on the site). */
export function home(nodeId: string): string {
  return catalog.find((f) => f.items.some((i) => i.id === node(nodeId).page))?.name ?? '';
}

/** Whether the node's page is live now (a folder with an index.ts). Read at build time. */
export const live = (nodeId: string): boolean => isLive(node(nodeId).page);

/** How a node's page is written on the map: its path, or a note when it is not live yet. */
export const pageText = (nodeId: string): string =>
  live(nodeId) ? `/${node(nodeId).page}/` : 'page not live yet';

/** A node's name as Markdown, linked to its page when the page is live. */
export const nodeLink = (nodeId: string): string => {
  const n = node(nodeId);
  return live(nodeId) ? `[${n.name}](/${n.page}/)` : n.name;
};

/** "Its page: [Name](/page/)." when the page is live; otherwise that it is not live yet. */
export const pageNote = (nodeId: string): string =>
  live(nodeId) ? `Its page: ${nodeLink(nodeId)}.` : 'Its page is not live yet.';

/** Every PATTERNS entry and Concurrency page is a node: for the tests. */
export const PATTERN_IDS = PATTERNS.map((p) => p.id);

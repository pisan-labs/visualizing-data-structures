import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'tour',
  title: 'A tour for the curious',
  audience: 'Curious, no computer science needed',
  blurb: 'Ten of the most watchable pages: sorting, searching, mazes, and a peek inside an LLM.',
  intro:
    'No course, no exam, no prerequisites. These are ten pages worth watching even if you ' +
    'have never written a line of code. Press play on the suggested example and watch what ' +
    'happens; the narration says what each step does. Read the lessons and answer the checks ' +
    'if you want the step marked done. Or just watch. Nobody is grading this.',
  stages: [
    {
      title: 'Putting things in order',
      steps: [
        {
          viz: 'bubble-sort',
          example: 'largest-last',
          note: 'The simplest way to sort: swap neighbours that are out of order until nothing moves.',
        },
        {
          viz: 'merge-sort',
          example: 'top-down',
          note: 'A much faster way: split the list in half, sort each half, then zip them together.',
        },
      ],
    },
    {
      title: 'Finding things fast',
      steps: [
        {
          viz: 'binary-search',
          example: 'found',
          note: 'Guess the middle, throw away half, repeat. Ten values take at most four guesses.',
        },
        {
          viz: 'bst',
          example: 'balanced-order',
          note: 'A tree where smaller goes left and larger goes right. Insert order decides how tall it gets.',
        },
      ],
    },
    {
      title: 'Mazes and routes',
      steps: [
        {
          viz: 'grid-bfs',
          example: 'maze',
          note: 'Spread out from the start one ring at a time, and the first time you reach the exit is the shortest way.',
        },
        {
          viz: 'a-star',
          example: 'manhattan',
          note: 'The same search with a sense of direction. It heads for the goal and skips most of the grid.',
        },
      ],
    },
    {
      title: 'When computers do too much',
      steps: [
        {
          viz: 'fibonacci-calls',
          example: 'explosion',
          note: 'A simple recipe that asks the same question 67 times to get one number.',
        },
        {
          viz: 'n-queens',
          example: 'four-first',
          note: 'Place queens so none attack each other. Watch it hit dead ends and back up.',
        },
        {
          viz: 'big-o-lab',
          example: 'quadratic-wall',
          note: 'Why programmers worry about this: a millisecond against 17 minutes on the same input.',
        },
      ],
    },
    {
      title: 'A peek inside an LLM',
      steps: [
        {
          viz: 'self-attention',
          example: 'cat-sat',
          note: 'How a language model links "sat" to "cat": each word scores how much every other word matters.',
        },
      ],
    },
  ],
};

export default path;

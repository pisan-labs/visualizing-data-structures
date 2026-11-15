import type { PathDef } from '../paths';

const path: PathDef = {
  id: 'llms',
  title: 'How LLMs work',
  audience: 'Programmers curious about what is inside an LLM',
  blurb: 'From text to tokens to attention to the next word, in 17 small pictures.',
  intro:
    'A large language model is a lot of arithmetic, but the ideas fit on a handful of pages. ' +
    'Every page here runs a tiny model you can step through: a few words, a few dimensions, ' +
    'numbers small enough to check by hand. Each step is one page. Play the suggested example, ' +
    'read the lessons, and answer the checks; the step is done when every lesson is read and ' +
    'every check is right. No calculus needed until the training stage, and not much then.',
  stages: [
    {
      title: 'Text into numbers',
      steps: [
        {
          viz: 'bpe-tokenizer',
          example: 'toy-corpus',
          note: 'Models do not see words. Merge the most common pair of symbols, again and again, and you get tokens.',
        },
        {
          viz: 'embeddings',
          example: 'kitten-cosine',
          note: 'Each token becomes a list of numbers. Similar meanings end up pointing the same way.',
        },
        {
          viz: 'word2vec',
          example: 'one-pass',
          note: 'Where those numbers come from: nudge words that appear together closer.',
        },
      ],
    },
    {
      title: 'Predicting the next token',
      steps: [
        {
          viz: 'ngram-lm',
          example: 'count-bigrams',
          note: 'The simplest language model: count which word follows which.',
        },
        {
          viz: 'sampling',
          example: 'hot',
          note: 'The model gives probabilities; temperature, top-k and top-p decide which word you get.',
        },
        {
          viz: 'beam-search',
          example: 'greedy-misses',
          note: 'Taking the likeliest word each time can miss the likeliest sentence.',
        },
      ],
    },
    {
      title: 'Inside the transformer',
      steps: [
        {
          viz: 'self-attention',
          example: 'cat-sat',
          note: 'Each word looks at the others and decides which ones matter. This is the core idea.',
        },
        {
          viz: 'multi-head-attention',
          example: 'two-heads',
          note: 'Several attention patterns side by side, each free to look for something different.',
        },
        {
          viz: 'positional-encoding',
          example: 'rope-turns',
          note: 'Attention ignores word order on its own. This is how order gets back in.',
        },
        {
          viz: 'transformer-block',
          example: 'first-word',
          note: 'Attention, a small network, and the residual stream, stacked into one block.',
        },
      ],
    },
    {
      title: 'Training',
      steps: [
        {
          viz: 'backpropagation',
          example: 'chain',
          note: 'The chain rule, one node at a time: how much each weight is to blame.',
        },
        {
          viz: 'gradient-descent',
          example: 'converge',
          note: 'Step downhill, and watch what the step size does. Then try momentum and Adam.',
        },
        {
          viz: 'lora',
          example: 'rank-two-reaches',
          note: 'Fine-tuning by training two thin matrices instead of the whole weight matrix.',
        },
      ],
    },
    {
      title: 'Serving and retrieval',
      steps: [
        {
          viz: 'kv-cache',
          example: 'one-by-one',
          note: 'Why generating the hundredth token does not redo the first ninety-nine.',
        },
        {
          viz: 'speculative-decoding',
          example: 'one-round',
          note: 'A small model guesses ahead and the big one checks several guesses at once.',
        },
        {
          viz: 'bm25',
          example: 'cat-mat',
          note: 'Retrieval before vectors: an inverted index and a score for word matches.',
        },
        {
          viz: 'hnsw',
          example: 'greedy-misses',
          note: 'Nearest neighbours among millions of embeddings by walking a graph, and where a greedy walk gets stuck.',
        },
      ],
    },
  ],
};

export default path;

from collections import Counter

END = "_"  # marks the end of a word


def split(word):
    """A word as its characters, then the end-of-word marker."""
    return tuple(word) + (END,)


def count_pairs(words):
    """Neighbouring pairs, each word counted as often as it occurs.

    words maps a word, as a tuple of tokens, to its count. The Counter
    remembers the order pairs were first met, which settles ties.
    """
    pairs = Counter()
    for tokens, count in words.items():
        for a, b in zip(tokens, tokens[1:]):
            pairs[a, b] += count
    return pairs


def merge_pair(tokens, a, b):
    """Join every a followed by b into one token, left to right."""
    out, i = [], 0
    while i < len(tokens):
        if i + 1 < len(tokens) and tokens[i] == a and tokens[i + 1] == b:
            out.append(a + b)
            i += 2
        else:
            out.append(tokens[i])
            i += 1
    return tuple(out)


def train(words, k, alphabetical=False):
    """Learn up to k merges. Returns them in order, and the merged words."""
    merges = []
    for _ in range(k):
        pairs = count_pairs(words)
        if not pairs:
            break  # every word is a single token
        top = max(pairs.values())
        if alphabetical:
            best = min(p for p, c in pairs.items() if c == top)
        else:
            best = next(p for p, c in pairs.items() if c == top)  # first met
        merges.append(best)
        words = {merge_pair(t, *best): c for t, c in words.items()}
    return merges, words


def encode(tokens, merges, alphabet):
    """Replay the merges, in the order learned, on a new word's tokens."""
    tokens = tuple(t if t in alphabet else "[UNK]" for t in tokens)
    for a, b in merges:
        tokens = merge_pair(tokens, a, b)
    return list(tokens)

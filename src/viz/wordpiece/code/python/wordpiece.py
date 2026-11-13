from collections import Counter

UNK = "[UNK]"
END = "$"  # marks a trie node that ends a piece (no letter is $)


def split(word):
    """The first letter as it is, every other letter as a ## piece."""
    return tuple(word[:1]) + tuple("##" + c for c in word[1:])


def join(a, b):
    """The piece a merge makes: b loses its ##."""
    return a + (b[2:] if b.startswith("##") else b)


def merge_pair(pieces, a, b):
    out, i = [], 0
    while i < len(pieces):
        if i + 1 < len(pieces) and pieces[i] == a and pieces[i + 1] == b:
            out.append(join(a, b))
            i += 2
        else:
            out.append(pieces[i])
            i += 1
    return tuple(out)


def train(words, k):
    """Learn up to k merges. words maps a word, as a tuple of pieces, to its
    count. Returns the merges in order, and the merged words."""
    merges = []
    for _ in range(k):
        count, pairs = Counter(), Counter()
        for pieces, c in words.items():
            for p in pieces:
                count[p] += c
            for a, b in zip(pieces, pieces[1:]):
                pairs[a, b] += c
        if not pairs:
            break  # every word is one piece
        # The best score; on a tie, max keeps the pair met first.
        best = max(pairs, key=lambda p: pairs[p] / (count[p[0]] * count[p[1]]))
        merges.append(best)
        words = {merge_pair(w, *best): c for w, c in words.items()}
    return merges, words


def build_trie(vocab):
    """Nested dicts, one level per letter. ## pieces hang under # and #."""
    root = {}
    for piece in vocab:
        node = root
        for ch in piece:
            node = node.setdefault(ch, {})
        node[END] = True
    return root


def encode(word, trie, max_len=100):
    """Greedy longest match first, as BERT does it."""
    if len(word) > max_len:
        return [UNK]
    pieces, start = [], 0
    while start < len(word):
        node = trie if start == 0 else trie.get("#", {}).get("#", {})
        last, i = None, start
        while i < len(word) and word[i] in node:  # walk down the trie
            node = node[word[i]]
            i += 1
            if END in node:
                last = i  # the longest piece so far
        if last is None:
            return [UNK]  # nothing fits: the whole word is unknown
        pieces.append(("##" if start > 0 else "") + word[start:last])
        start = last
    return pieces

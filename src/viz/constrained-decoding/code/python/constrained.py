import math

END = "</s>"


def walk(dfa, q, token):
    """The state token ends in from q, or None if a letter has no move (the text would leave
    the regex). </s> reads nothing and is allowed only in an accepting state."""
    if token == END:
        return q if q in dfa["accept"] else None
    for c in token:
        q = dfa["delta"].get((q, c))
        if q is None:
            return None
    return q


def build_index(dfa, vocab):
    """For each state, every token that keeps the text on the DFA, with the state it ends in.
    Built once per regex; each decoding step is then a lookup."""
    index = {}
    for q in dfa["states"]:
        index[q] = {}
        for t in vocab:
            to = walk(dfa, q, t)
            if to is not None:
                index[q][t] = to
    return index


def softmax(z):
    m = max(z)
    e = [math.exp(v - m) for v in z]
    total = 0.0
    for v in e:
        total += v
    return [v / total for v in e]


def next_token(vocab, logits, allowed, greedy, u):
    """Set the logits of tokens not in allowed to -inf (allowed None: no mask), then take the
    most likely token, or the one whose stretch of [0, 1) holds u, in vocabulary order."""
    z = [l if allowed is None or t in allowed else -math.inf for t, l in zip(vocab, logits)]
    p = softmax(z)
    if greedy:
        best = 0
        for k in range(1, len(p)):
            if p[k] > p[best]:
                best = k
        return vocab[best]
    cum = 0.0
    for k in range(len(p)):
        cum += p[k]
        if u < cum:
            return vocab[k]
    return vocab[max(k for k in range(len(p)) if p[k] > 0)]

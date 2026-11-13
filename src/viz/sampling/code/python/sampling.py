import math


def softmax(logits, temperature=1.0):
    """Probabilities from logits. Subtracting the largest keeps exp from overflowing."""
    z = [x / temperature for x in logits]
    m = max(z)
    e = [math.exp(v - m) for v in z]
    total = 0.0
    for v in e:
        total += v
    return [v / total for v in e]


def most_likely_first(p):
    """Token indices, largest probability first; ties keep their order."""
    return sorted(range(len(p)), key=lambda i: -p[i])


def cut(p, strategy, k=3, top_p=0.9, min_p=0.1):
    """The tokens that survive, most likely first."""
    order = most_likely_first(p)
    if strategy == "greedy":
        return order[:1]
    if strategy == "top-k":
        return order[:k]
    if strategy == "top-p":
        kept, mass = [], 0.0
        for i in order:
            kept.append(i)
            mass += p[i]
            if mass >= top_p:  # the fewest tokens with at least top_p between them
                break
        return kept
    if strategy == "min-p":
        floor = min_p * p[order[0]]
        return [i for i in order if p[i] >= floor]
    return order  # plain sampling keeps every token


def renormalize(p, kept):
    """The kept tokens' probabilities scaled to add up to 1; every other token gets 0."""
    mass = 0.0
    for i in kept:
        mass += p[i]
    q = [0.0] * len(p)
    for i in kept:
        q[i] = p[i] / mass
    return q


def draw(q, kept, u):
    """Lay the kept tokens end to end on [0, 1) and return the one whose stretch holds u."""
    cum = 0.0
    for i in kept:
        cum += q[i]
        if u < cum:
            return i
    return kept[-1]  # u past the last total by rounding

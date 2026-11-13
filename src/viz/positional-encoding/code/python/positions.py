import math

BASE = 10000


def angle(pos, i, d):
    """Pair i turns pos / 10000^(2i/d) radians: each pair slower than the last."""
    return pos / BASE ** (2 * i / d)


def sinusoidal(n, d):
    """Vaswani et al.: row pos is sin, cos of each pair's angle, added to the embedding."""
    return [[f(angle(pos, i, d)) for i in range(d // 2) for f in (math.sin, math.cos)]
            for pos in range(n)]


def rotate(v, pos):
    """RoPE: turn each pair (v[2i], v[2i+1]) of a query or key by its angle at pos."""
    out = []
    for i in range(len(v) // 2):
        a = angle(pos, i, len(v))
        x, y = v[2 * i], v[2 * i + 1]
        out += [x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)]
    return out


def rope_scores(q, k):
    """Every query against every key, each turned by its own position."""
    qs = [rotate(v, m) for m, v in enumerate(q)]
    ks = [rotate(v, n) for n, v in enumerate(k)]
    return [[sum(a * b for a, b in zip(qm, kn)) for kn in ks] for qm in qs]


def softmax(scores):
    m = max(scores)
    e = [math.exp(s - m) for s in scores]
    total = sum(e)
    return [x / total for x in e]


def alibi_attention(q, k, slope=0.5):
    """Press et al.: no position vectors; the score of query i for key j gets
    -slope * (i - j), and keys after the query are masked."""
    n, dk = len(q), len(q[0])
    a = []
    for i in range(n):
        scores = []
        for j in range(n):
            s = sum(q[i][t] * k[j][t] for t in range(dk)) / math.sqrt(dk)
            scores.append(s + -slope * (i - j) if j <= i else -math.inf)
        a.append(softmax(scores))
    return a

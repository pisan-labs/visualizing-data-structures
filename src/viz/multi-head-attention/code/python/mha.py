import math


def matmul(a, b):
    """a (n x m) times b (m x p)."""
    return [[sum(row[t] * b[t][j] for t in range(len(b))) for j in range(len(b[0]))]
            for row in a]


def softmax(scores):
    """Weights that add up to 1. Subtracting the largest score keeps exp from overflowing."""
    m = max(scores)
    e = [math.exp(s - m) for s in scores]
    total = sum(e)
    return [x / total for x in e]


def multi_head_attention(x, wq, wk, wv, wo, h, h_kv):
    """Causal attention with h query heads and h_kv key/value heads.

    wq is d_model x d_model, cut into h heads of d = d_model / h columns. wk and wv
    are d_model x (h_kv * d): one block of d columns per key/value head. Query head
    i reads key/value head i // (h // h_kv). With h_kv = h this is multi-head
    attention, with h_kv = 1 multi-query, and in between grouped-query.
    Returns each head's weights and the output O.
    """
    q, k, v = matmul(x, wq), matmul(x, wk), matmul(x, wv)
    n, d = len(x), len(wq[0]) // h
    group = h // h_kv
    weights, z = [], [[] for _ in range(n)]
    for i in range(h):
        g = i // group  # the key/value head this query head reads
        a = []
        for r in range(n):
            scores = []
            for c in range(n):
                s = sum(q[r][i * d + t] * k[c][g * d + t] for t in range(d)) / math.sqrt(d)
                scores.append(s if c <= r else -math.inf)  # causal mask
            a.append(softmax(scores))
        for r in range(n):  # this head's output goes next to the others
            z[r] += [sum(a[r][c] * v[c][g * d + t] for c in range(n)) for t in range(d)]
        weights.append(a)
    return weights, matmul(z, wo)

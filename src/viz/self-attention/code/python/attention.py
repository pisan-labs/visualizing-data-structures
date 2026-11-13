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


def self_attention(x, wq, wk, wv, causal=True, scale=True):
    """One head of scaled dot-product attention.

    x holds one row per word (its embedding); wq, wk and wv turn a row into
    its query, key and value. Returns the weights A and the outputs Z.
    """
    q, k, v = matmul(x, wq), matmul(x, wk), matmul(x, wv)
    n, dk = len(x), len(wq[0])
    a = []
    for i in range(n):
        scores = []
        for j in range(n):
            s = sum(q[i][t] * k[j][t] for t in range(dk))  # q_i . k_j
            if scale:
                s /= math.sqrt(dk)
            if causal and j > i:
                s = -math.inf  # no peeking at later words
            scores.append(s)
        a.append(softmax(scores))
    return a, matmul(a, v)

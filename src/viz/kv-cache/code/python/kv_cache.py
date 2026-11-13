import math
from collections import deque


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


def attend(q, keys, values):
    """One query against the keys it may see: scaled scores, softmax, a blend of the values."""
    dk = len(q)
    a = softmax([sum(q[t] * k[t] for t in range(dk)) / math.sqrt(dk) for k in keys])
    return [sum(a[j] * values[j][c] for j in range(len(values))) for c in range(len(values[0]))]


class KVCache:
    """The key and value of every token so far, one row each, oldest first.

    With a window, only the last `window` tokens stay: appending to a full
    deque drops its oldest row.
    """

    def __init__(self, wq, wk, wv, window=0):
        self.wq, self.wk, self.wv = wq, wk, wv
        self.window = window  # 0 keeps every token
        self.keys = deque(maxlen=window or None)
        self.values = deque(maxlen=window or None)

    def prefill(self, xs):
        """The whole prompt at once. Returns every prompt token's output."""
        q, k, v = matmul(xs, self.wq), matmul(xs, self.wk), matmul(xs, self.wv)
        out = []
        for i in range(len(xs)):
            lo = max(0, i + 1 - self.window) if self.window else 0
            out.append(attend(q[i], k[lo:i + 1], v[lo:i + 1]))  # tokens lo..i only
        self.keys.extend(k)
        self.values.extend(v)
        return out

    def decode(self, x):
        """One new token: one new row of K and one of V, then attend over the cache."""
        q, k, v = matmul([x], self.wq)[0], matmul([x], self.wk)[0], matmul([x], self.wv)[0]
        self.keys.append(k)
        self.values.append(v)
        return attend(q, self.keys, self.values)


def decode_without_cache(xs, wq, wk, wv, window=0):
    """The last token's output, computing the key and value of every token it sees again."""
    seen = xs[-window:] if window else xs
    keys, values = matmul(seen, wk), matmul(seen, wv)
    return attend(matmul([xs[-1]], wq)[0], keys, values)

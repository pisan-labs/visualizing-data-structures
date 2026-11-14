import math

BETA1, BETA2, EPS = 0.9, 0.999, 1e-8


def matmul(a, b):
    """a (n x m) times b (m x p)."""
    out = []
    for row in a:
        new = []
        for j in range(len(b[0])):
            s = 0.0
            for t in range(len(b)):
                s += row[t] * b[t][j]
            new.append(s)
        out.append(new)
    return out


def zeros_like(m):
    return [[0.0] * len(m[0]) for _ in m]


class LoRA:
    """A frozen d x d matrix W plus a trainable low-rank update (alpha / r) * B * A.

    B is d x r and starts at zero; A is r x d and starts small and random,
    so the update starts at zero and the layer starts unchanged.
    """

    def __init__(self, w, b, a, alpha, lr=0.1):
        self.w = w  # frozen: never trained
        self.b, self.a = b, a  # the only trained numbers: 2 * d * r of them
        self.scale = alpha / len(a)  # alpha / r
        self.lr = lr
        self.mb, self.vb = zeros_like(b), zeros_like(b)  # Adam's averages for B
        self.ma, self.va = zeros_like(a), zeros_like(a)  # and for A
        self.p1 = self.p2 = 1.0  # beta1^t and beta2^t

    def delta(self):
        """The update the adapter adds to W."""
        return [[self.scale * x for x in row] for row in matmul(self.b, self.a)]

    def loss(self, target):
        """Sum of squared differences between the update and the target update."""
        total = 0.0
        for row, goal in zip(self.delta(), target):
            for x, y in zip(row, goal):
                total += (x - y) * (x - y)
        return total

    def train_step(self, target):
        d, r = len(self.b), len(self.a)
        g = [[2 * (x - y) for x, y in zip(row, goal)]
             for row, goal in zip(self.delta(), target)]
        gb = [[0.0] * r for _ in range(d)]  # dLoss/dB = scale * g * A^T
        for i in range(d):
            for k in range(r):
                s = 0.0
                for j in range(d):
                    s += g[i][j] * self.a[k][j]
                gb[i][k] = self.scale * s
        ga = [[0.0] * d for _ in range(r)]  # dLoss/dA = scale * B^T * g
        for k in range(r):
            for j in range(d):
                s = 0.0
                for i in range(d):
                    s += self.b[i][k] * g[i][j]
                ga[k][j] = self.scale * s
        self.p1 *= BETA1
        self.p2 *= BETA2
        self.adam(self.b, gb, self.mb, self.vb)
        self.adam(self.a, ga, self.ma, self.va)

    def adam(self, p, g, m, v):
        for i in range(len(p)):
            for j in range(len(p[0])):
                m[i][j] = BETA1 * m[i][j] + (1 - BETA1) * g[i][j]
                v[i][j] = BETA2 * v[i][j] + (1 - BETA2) * g[i][j] * g[i][j]
                mh = m[i][j] / (1 - self.p1)
                vh = v[i][j] / (1 - self.p2)
                p[i][j] -= self.lr * mh / (math.sqrt(vh) + EPS)

    def merge(self):
        """W + update: one matrix again, so serving costs what it did before."""
        dw = self.delta()
        return [[x + y for x, y in zip(row, up)] for row, up in zip(self.w, dw)]

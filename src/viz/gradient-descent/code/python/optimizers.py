import math


class GradientDescent:
    def __init__(self, lr):
        self.lr = lr

    def step(self, x, g):
        """x moves against the gradient g."""
        return [xi - self.lr * gi for xi, gi in zip(x, g)]


class Momentum:
    """Polyak's heavy ball: a velocity that keeps beta of itself each step."""

    def __init__(self, lr, beta=0.9):
        self.lr, self.beta, self.v = lr, beta, None

    def step(self, x, g):
        if self.v is None:
            self.v = [0.0] * len(x)
        self.v = [self.beta * vi - self.lr * gi for vi, gi in zip(self.v, g)]
        return [xi + vi for xi, vi in zip(x, self.v)]


class Adam:
    """Kingma and Ba (2015): running averages of g and g squared."""

    def __init__(self, lr, beta1=0.9, beta2=0.999, eps=1e-8, bias_correction=True):
        self.lr, self.beta1, self.beta2, self.eps = lr, beta1, beta2, eps
        self.bias_correction = bias_correction
        self.m = self.s = None
        self.b1t = self.b2t = 1.0  # beta1 ** t and beta2 ** t

    def step(self, x, g):
        if self.m is None:
            self.m, self.s = [0.0] * len(x), [0.0] * len(x)
        self.b1t *= self.beta1
        self.b2t *= self.beta2
        out = []
        for i in range(len(x)):
            self.m[i] = self.beta1 * self.m[i] + (1 - self.beta1) * g[i]
            self.s[i] = self.beta2 * self.s[i] + (1 - self.beta2) * g[i] * g[i]
            m_hat, s_hat = self.m[i], self.s[i]
            if self.bias_correction:  # both averages start at 0
                m_hat /= 1 - self.b1t
                s_hat /= 1 - self.b2t
            out.append(x[i] - self.lr * m_hat / (math.sqrt(s_hat) + self.eps))
        return out

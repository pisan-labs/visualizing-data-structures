import math


def power(x, k):
    """x to a whole power k, by repeated multiplication."""
    p = 1.0
    for _ in range(k):
        p *= x
    return p


class Value:
    """A number that remembers how it was made, so gradients can flow back."""

    def __init__(self, data, inputs=()):
        self.data = data
        self.grad = 0.0
        self.inputs = inputs
        self._backward = lambda: None  # passes self.grad on to the inputs

    def __add__(self, other):
        out = Value(self.data + other.data, (self, other))

        def _backward():
            self.grad += out.grad
            other.grad += out.grad
        out._backward = _backward
        return out

    def __sub__(self, other):
        out = Value(self.data - other.data, (self, other))

        def _backward():
            self.grad += out.grad
            other.grad += -out.grad
        out._backward = _backward
        return out

    def __mul__(self, other):
        out = Value(self.data * other.data, (self, other))

        def _backward():
            self.grad += other.data * out.grad
            other.grad += self.data * out.grad
        out._backward = _backward
        return out

    def __truediv__(self, other):
        out = Value(self.data / other.data, (self, other))

        def _backward():
            self.grad += (1 / other.data) * out.grad
            other.grad += (-self.data / (other.data * other.data)) * out.grad
        out._backward = _backward
        return out

    def __neg__(self):
        out = Value(-self.data, (self,))

        def _backward():
            self.grad += -out.grad
        out._backward = _backward
        return out

    def __pow__(self, k):
        out = Value(power(self.data, k), (self,))

        def _backward():
            self.grad += (k * power(self.data, k - 1)) * out.grad
        out._backward = _backward
        return out

    def _unary(self, data, local):
        """A function of one value; local(out) is its derivative."""
        out = Value(data, (self,))

        def _backward():
            self.grad += local(out.data) * out.grad
        out._backward = _backward
        return out

    def tanh(self):
        return self._unary(math.tanh(self.data), lambda t: 1 - t * t)

    def relu(self):
        return self._unary(self.data if self.data > 0 else 0.0,
                           lambda r: 1.0 if self.data > 0 else 0.0)

    def exp(self):
        return self._unary(math.exp(self.data), lambda e: e)

    def sigmoid(self):
        return self._unary(1 / (1 + math.exp(-self.data)), lambda s: s * (1 - s))

    def backward(self):
        """Fill in d(self)/d(v) for every value v that self was made from."""
        order, seen = [], set()

        def build(v):  # depth-first: v goes in after everything it reads
            if v not in seen:
                seen.add(v)
                for u in v.inputs:
                    build(u)
                order.append(v)
        build(self)
        self.grad = 1.0
        for v in reversed(order):
            v._backward()

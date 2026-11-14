import math

# Hand-made weights for one memory unit that means "an animal". A word is four
# numbers: how much it is an animal, a thing, an action and a small word.
U = [1, 0, 0, 0]  # the plain RNN: only an animal writes to the memory
GATES = {  # LSTM: (a weight per feature, the weight on h, the bias)
    "f": ([-6, 0, 0, 0], 0, 3),  # an animal shuts the forget gate
    "i": ([6, 0, 0, 0], 0, -3),  # ... and opens the input gate
    "g": ([2, 0, 0, 0], 0, 0),  # the candidate: "an animal"
    "o": ([0, 0, 4, 0], 0, -2),  # a verb opens the output gate
}


def dot(x, u):
    s = 0.0
    for a, b in zip(x, u):
        s += a * b
    return s


def sigmoid(z):
    return 1 / (1 + math.exp(-z))


def gate(name, x, h):
    u, w, b = GATES[name]
    return dot(x, u) + h * w + b


class Recurrent:
    """Reads one word vector at a time. model is "rnn", "lstm" or "lstm97"
    (the 1997 cell, with no forget gate). pull is d(memory now) / d(memory
    after word 1): a product of one factor per step."""

    def __init__(self, model, w=0.8):
        self.model, self.w = model, w
        self.h = self.c = 0.0
        self.pull = None

    def read(self, x):
        if self.model == "rnn":
            self.h = math.tanh(self.w * self.h + dot(x, U))
            factor = self.w * (1 - self.h * self.h)  # the slope of this step
            out = [self.h]
        else:
            f = sigmoid(gate("f", x, self.h)) if self.model == "lstm" else 1.0
            i = sigmoid(gate("i", x, self.h))
            g = math.tanh(gate("g", x, self.h))
            o = sigmoid(gate("o", x, self.h))
            self.c = f * self.c + i * g  # keep some of the old, add some new
            self.h = o * math.tanh(self.c)
            factor = f  # the cell's path back is only the forget gate
            out = [f, i, g, self.c, o, self.h]
        self.pull = 1.0 if self.pull is None else self.pull * factor
        return out + [self.pull]

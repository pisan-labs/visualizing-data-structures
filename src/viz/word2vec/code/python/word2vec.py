import math


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def dot(a, b):
    s = 0.0
    for x, y in zip(a, b):
        s += x * y
    return s


def pairs(words, window):
    """(center, context) for each word and every other word at most `window` away."""
    out = []
    for i, center in enumerate(words):
        for j in range(max(0, i - window), min(len(words), i + window + 1)):
            if j != i:
                out.append((center, words[j]))
    return out


def noise_distribution(counts, power=0.75):
    """P(n) proportional to count(n) ** 0.75: common words, but less dominant."""
    weights = {w: c ** power for w, c in counts.items()}
    total = 0.0
    for x in weights.values():
        total += x
    return {w: x / total for w, x in weights.items()}


def draw(noise, u):
    """The word whose stretch of the cumulative distribution holds u in [0, 1)."""
    cum = 0.0
    for w, p in noise.items():
        cum += p
        if u < cum:
            return w
    return w


def negatives(noise, k, center, context, uniform):
    """k distinct noise words, never the pair's own words. uniform() gives u in [0, 1)."""
    out = []
    while len(out) < k:
        n = draw(noise, uniform())
        if n not in (center, context) and n not in out:
            out.append(n)
    return out


def update(w, c, center, context, noise_words, lr):
    """One step of skip-gram with negative sampling. w and c map words to vectors.

    Pull c[context] toward w[center] (want sigmoid of their dot product to be 1),
    push each noise word's c away (want 0), then move w[center] by the sum.
    Returns the sigmoids before the update.
    """
    v = w[center]
    grad = [0.0] * len(v)
    sigmas = []
    for t, label in [(context, 1)] + [(n, 0) for n in noise_words]:
        s = sigmoid(dot(v, c[t]))
        g = s - label
        grad = [gi + g * ct for gi, ct in zip(grad, c[t])]
        c[t] = [ct - lr * g * vi for ct, vi in zip(c[t], v)]
        sigmas.append(s)
    w[center] = [vi - lr * gi for vi, gi in zip(v, grad)]
    return sigmas

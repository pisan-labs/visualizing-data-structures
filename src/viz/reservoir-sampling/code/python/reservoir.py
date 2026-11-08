import random


def reservoir_sample(stream, k, randint=random.randint):
    """A uniform sample of k items from a stream of unknown length (Algorithm R).
    randint(lo, hi) returns a random int in [lo, hi]."""
    reservoir = []
    for i, item in enumerate(stream, start=1):
        if i <= k:
            reservoir.append(item)  # the first k go straight in
        else:
            j = randint(1, i)
            if j <= k:  # probability k / i
                reservoir[j - 1] = item
    return reservoir

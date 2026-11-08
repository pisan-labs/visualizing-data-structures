import random


def shuffle(a, randint=random.randint):
    """Shuffle a in place (Fisher-Yates). randint(lo, hi) returns a random int in [lo, hi]."""
    n = len(a)
    for i in range(n - 1):
        j = randint(i, n - 1)  # from the unshuffled part, i included
        a[i], a[j] = a[j], a[i]

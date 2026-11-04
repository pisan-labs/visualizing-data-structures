import random


def quickselect(a, k, p=0, r=None):
    """Return the k-th smallest value in a[p..r] (k = 1 for the smallest).

    The answer belongs in a[k - 1]. Partition, then look only at the side
    of the pivot that holds that slot. Reorders a as it goes.
    """
    if r is None:
        r = len(a) - 1
    if p == r:
        return a[p]
    q = randomized_partition(a, p, r)
    if k - 1 == q:
        return a[q]
    if k - 1 < q:
        return quickselect(a, k, p, q - 1)
    return quickselect(a, k, q + 1, r)


def randomized_partition(a, p, r):
    """Swap a random value to the end, then partition around it."""
    i = random.randint(p, r)
    a[i], a[r] = a[r], a[i]
    return partition(a, p, r)


def partition(a, p, r):
    """Lomuto's partition around a[r]. Returns where the pivot lands."""
    x = a[r]
    i = p - 1
    for j in range(p, r):
        if a[j] <= x:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[r] = a[r], a[i + 1]
    return i + 1

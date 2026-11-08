"""A doubling experiment: count an algorithm's basic steps at n, 2n, 4n, ...

Each algorithm returns how many basic steps it took. doubling() runs one at
sizes that double and estimates b in T(n) ~ a * n**b from each ratio, since
T(2n) / T(n) ~ 2**b.
"""
import math

MISSING = 1_000_000  # bigger than every input value, so searches never find it


def linear_search(a, x=MISSING):
    steps = 0
    for v in a:
        steps += 1  # one comparison
        if v == x:
            break
    return steps


def binary_search(a, x=MISSING):
    """a is sorted."""
    steps = 0
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        steps += 1  # one probe
        if a[mid] == x:
            break
        if a[mid] < x:
            lo = mid + 1
        else:
            hi = mid - 1
    return steps


def distinct_values(a):
    """Put a's values in a hash set (linear probing): count slots looked at."""
    bits = 1
    while (1 << bits) < 2 * len(a):
        bits += 1
    size = 1 << bits
    slots = [None] * size
    steps = 0
    for x in a:
        i = ((x * 2654435761) & 0xFFFFFFFF) >> (32 - bits)
        while True:
            steps += 1  # one slot looked at
            if slots[i] is None:
                slots[i] = x
                break
            if slots[i] == x:
                break
            i = (i + 1) % size
    return steps


def merge_sort(a):
    steps = 0
    aux = a[:]

    def sort(lo, hi):  # sorts a[lo:hi]
        nonlocal steps
        if hi - lo < 2:
            return
        mid = (lo + hi) // 2
        sort(lo, mid)
        sort(mid, hi)
        aux[lo:hi] = a[lo:hi]
        i, j, k = lo, mid, lo
        while i < mid and j < hi:
            steps += 1  # one comparison
            if aux[i] <= aux[j]:
                a[k] = aux[i]
                i += 1
            else:
                a[k] = aux[j]
                j += 1
            k += 1
        a[k:hi] = aux[i:mid] + aux[j:hi]  # one of the two is empty

    sort(0, len(a))
    return steps


def insertion_sort(a):
    steps = 0
    for j in range(1, len(a)):
        key = a[j]
        i = j - 1
        while i >= 0:
            steps += 1  # one comparison
            if a[i] <= key:
                break
            a[i + 1] = a[i]
            i -= 1
        a[i + 1] = key
    return steps


def three_sum(a):
    """Count the triples that add up to 0. Returns (triples, steps)."""
    n = len(a)
    triples = steps = 0
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                steps += 1  # one triple checked
                if a[i] + a[j] + a[k] == 0:
                    triples += 1
    return triples, steps


ALGORITHMS = {
    "linear": linear_search,
    "binary": binary_search,
    "hash": distinct_values,
    "merge": merge_sort,
    "insertion": insertion_sort,
    "threesum": lambda a: three_sum(a)[1],
}


def doubling(algorithm, make_input, n, largest):
    """Rows (n, T(n), b) for n, 2n, 4n, ... up to largest; b is None at first."""
    rows = []
    before = None
    while n <= largest:
        t = algorithm(make_input(n))
        b = math.log2(t / before) if before else None
        rows.append((n, t, b))
        before = t
        n *= 2
    return rows

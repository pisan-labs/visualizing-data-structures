def cyclic_sort(a):
    """a holds n numbers, each from 1 to n. Put each value v at its home, a[v - 1], in place.
    Each swap sends one value home for good, so at most n - 1 swaps."""
    i = 0
    while i < len(a):
        j = a[i] - 1  # where a[i] belongs
        if a[i] != a[j]:
            a[i], a[j] = a[j], a[i]  # a[j] is home; look at the new a[i]
        else:
            i += 1  # home already, or a repeat whose home is taken


def missing_and_repeated(a):
    """The numbers from 1 to n missing from a, and the repeats, in index order. Sorts a."""
    cyclic_sort(a)
    missing, repeated = [], []
    for i, v in enumerate(a):
        if v != i + 1:  # slot i should hold i + 1
            missing.append(i + 1)
            repeated.append(v)
    return missing, repeated

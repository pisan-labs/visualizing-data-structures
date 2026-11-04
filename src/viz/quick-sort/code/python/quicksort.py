def quicksort(a, p=0, r=None):
    """Sort a[p..r] in place (r included), smallest first."""
    if r is None:
        r = len(a) - 1
    if p < r:
        q = partition(a, p, r)
        quicksort(a, p, q - 1)
        quicksort(a, q + 1, r)


def partition(a, p, r):
    """Lomuto's partition around the last value. Returns where the pivot lands."""
    x = a[r]
    i = p - 1
    for j in range(p, r):
        if a[j] <= x:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[r] = a[r], a[i + 1]
    return i + 1

def cocktail_sort(a):
    """Sort the list a in place, smallest first.

    Passes alternate direction. A forward pass carries the largest value in
    a[lo..hi] to a[hi]; a backward pass carries the smallest to a[lo].
    A pass with no swaps means the list is sorted.
    """
    lo, hi = 0, len(a) - 1
    while lo < hi:
        swapped = False
        for j in range(lo, hi):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        hi -= 1
        if not swapped:
            return
        swapped = False
        for j in range(hi, lo, -1):
            if a[j] < a[j - 1]:
                a[j], a[j - 1] = a[j - 1], a[j]
                swapped = True
        lo += 1
        if not swapped:
            return

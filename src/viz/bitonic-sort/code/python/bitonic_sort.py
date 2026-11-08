def bitonic_sort(a):
    """Sort the list a in place with a bitonic sorting network.

    len(a) must be a power of two. The comparators do not depend on the
    values, so each inner loop over i could run all at once in parallel.
    """
    n = len(a)
    assert n & (n - 1) == 0, "n must be a power of two"
    size = 2
    while size <= n:
        # Flip: each value in the first half of a block meets its mirror.
        for i in range(n):
            j = i ^ (size - 1)
            if j > i and a[i] > a[j]:
                a[i], a[j] = a[j], a[i]
        # Half-cleaners: compare values d apart, d = size/4, ..., 1.
        d = size // 4
        while d >= 1:
            for i in range(n):
                j = i ^ d
                if j > i and a[i] > a[j]:
                    a[i], a[j] = a[j], a[i]
            d //= 2
        size *= 2

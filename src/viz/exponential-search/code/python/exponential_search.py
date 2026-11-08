def exponential_search(a, x):
    """Return an index of x in the sorted list a, or -1 if x is not there.

    Jump to a[1], a[2], a[4], ... until a value is not smaller than x,
    then binary search the stretch between the last two jumps.
    """
    n = len(a)
    bound = 1
    while bound < n and a[bound] < x:
        bound *= 2
    lo, hi = bound // 2, min(bound, n - 1)
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x:
            return mid
        if a[mid] > x:
            hi = mid - 1
        else:
            lo = mid + 1
    return -1

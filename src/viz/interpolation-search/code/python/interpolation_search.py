def interpolation_search(a, x):
    """Return an index of x in the sorted list a, or -1 if x is not there.

    Instead of the middle, look where x should be if the values in
    a[lo..hi] climbed in a straight line from a[lo] to a[hi].
    """
    lo, hi = 0, len(a) - 1
    while lo <= hi and a[lo] <= x <= a[hi]:
        if a[lo] == a[hi]:  # the whole window is x; avoid dividing by 0
            return lo
        pos = lo + (x - a[lo]) * (hi - lo) // (a[hi] - a[lo])
        if a[pos] == x:
            return pos
        if a[pos] < x:
            lo = pos + 1
        else:
            hi = pos - 1
    return -1

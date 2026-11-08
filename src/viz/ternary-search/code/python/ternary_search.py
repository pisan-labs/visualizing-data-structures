def ternary_search(a, x):
    """Return an index of x in the sorted list a, or -1 if x is not there.

    Look at two points, a third and two thirds of the way across the
    window, and keep the third that can hold x.
    """
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        third = (hi - lo) // 3
        m1, m2 = lo + third, hi - third
        if a[m1] == x:
            return m1
        if a[m2] == x:
            return m2
        if x < a[m1]:
            hi = m1 - 1
        elif x > a[m2]:
            lo = m2 + 1
        else:
            lo, hi = m1 + 1, m2 - 1
    return -1


def ternary_max(a):
    """Return the index of the peak of a, which rises and then falls.

    Compare the two points: the lower one's side cannot hold the peak.
    Returns -1 for an empty list.
    """
    if not a:
        return -1
    lo, hi = 0, len(a) - 1
    while lo < hi:
        third = (hi - lo) // 3
        m1, m2 = lo + third, hi - third
        if a[m1] < a[m2]:
            lo = m1 + 1
        else:
            hi = m2 - 1
    return lo

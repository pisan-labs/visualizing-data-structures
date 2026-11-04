# Binary search on a sorted list a. Each function looks at the
# middle of the window [lo, hi] and throws away half of it.


def search(a, x):
    """Return an index of x in a, or -1 if x is not there."""
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x:
            return mid
        elif a[mid] > x:
            hi = mid - 1
        else:
            lo = mid + 1
    return -1


def first(a, x):
    """Return the index of the first x in a, or -1."""
    lo, hi = 0, len(a) - 1
    r = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x:
            r = mid  # remember it, keep looking left
            hi = mid - 1
        elif a[mid] > x:
            hi = mid - 1
        else:
            lo = mid + 1
    return r


def lower_bound(a, x):
    """Return the index of the first value >= x (len(a) if none).

    Same as bisect.bisect_left(a, x).
    """
    lo, hi = 0, len(a)  # the window is a[lo:hi]
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] >= x:
            hi = mid
        else:
            lo = mid + 1
    return lo


def upper_bound(a, x):
    """Return the index of the first value > x (len(a) if none).

    Same as bisect.bisect_right(a, x).
    """
    lo, hi = 0, len(a)
    while lo < hi:
        mid = (lo + hi) // 2
        if a[mid] > x:
            hi = mid
        else:
            lo = mid + 1
    return lo


def locate(a, x):
    """Return an index of x, or -(insertion point) - 1 if x is not there."""
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x:
            return mid
        elif a[mid] > x:
            hi = mid - 1
        else:
            lo = mid + 1
    return -(lo + 1)  # x would go at index lo

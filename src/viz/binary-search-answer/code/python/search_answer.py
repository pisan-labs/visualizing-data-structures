def fits(w, d, c):
    """Can capacity c ship the packages w, in order, in d days?"""
    days, load = 1, 0
    for x in w:
        if load + x > c:  # x does not fit today: it goes on a new day
            days, load = days + 1, 0
            if days > d:
                return False
        load += x
    return True


def smallest_capacity(w, d):
    """The smallest capacity that ships w in d days."""
    lo, hi = max(w), sum(w)  # the heaviest must fit; one day takes everything
    while lo < hi:
        mid = (lo + hi) // 2
        if fits(w, d, mid):
            hi = mid  # mid works: the answer is mid or less
        else:
            lo = mid + 1  # mid is too small, and so is everything below it
    return lo


def spreads(p, k, g):
    """Can k items sit on the sorted positions p with every gap at least g?"""
    count, last = 1, p[0]
    for x in p[1:]:
        if x - last >= g:  # far enough from the last item: put one here
            count, last = count + 1, x
            if count == k:
                return True
    return False


def largest_gap(p, k):
    """The largest smallest gap k items can keep on the positions p (all different)."""
    p = sorted(p)
    lo, hi = 1, p[-1] - p[0]
    while lo < hi:
        mid = (lo + hi + 1) // 2  # round up, or lo = mid could repeat forever
        if spreads(p, k, mid):
            lo = mid
        else:
            hi = mid - 1
    return lo

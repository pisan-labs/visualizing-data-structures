def pair_sum(a, target):
    """Indices (lo, hi) with a[lo] + a[hi] == target in sorted a, or None."""
    lo, hi = 0, len(a) - 1
    while lo < hi:
        s = a[lo] + a[hi]
        if s == target:
            return lo, hi
        if s < target:
            lo += 1  # a[lo] is too small for every partner left
        else:
            hi -= 1  # a[hi] is too big for every partner left
    return None


def max_water(a):
    """The most water two walls hold: min(a[i], a[j]) * (j - i)."""
    lo, hi, best = 0, len(a) - 1, 0
    while lo < hi:
        best = max(best, min(a[lo], a[hi]) * (hi - lo))
        if a[lo] < a[hi]:
            lo += 1
        else:
            hi -= 1
    return best


def remove_duplicates(a):
    """Keep one copy of each value of sorted a in a[:k]; return k."""
    if not a:
        return 0
    slow = 0
    for fast in range(1, len(a)):
        if a[fast] != a[slow]:
            slow += 1
            a[slow] = a[fast]
    return slow + 1


def reverse(a):
    lo, hi = 0, len(a) - 1
    while lo < hi:
        a[lo], a[hi] = a[hi], a[lo]
        lo += 1
        hi -= 1

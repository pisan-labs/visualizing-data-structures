def apply_updates(a, updates):
    """A copy of a with x added to a[l..r] for every (l, r, x). O(n + q) for q updates."""
    n = len(a)
    d = [0] * (n + 1)  # one spare, so r + 1 = n needs no special case
    for l, r, x in updates:
        d[l] += x  # from l on, everything changes by x
        d[r + 1] -= x  # and from r + 1 on, it stops
    out = []
    run = 0
    for i in range(n):
        run += d[i]  # the total change at i
        out.append(a[i] + run)
    return out

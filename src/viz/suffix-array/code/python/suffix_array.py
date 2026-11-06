def suffix_array(t):
    """Start positions of the suffixes of t in sorted order, by prefix doubling."""
    n = len(t)
    rank = [ord(ch) for ch in t]
    sa = list(range(n))
    k = 1
    while True:
        # Sort by the first 2k characters: a pair of ranks, -1 past the end.
        def key(i):
            return (rank[i], rank[i + k] if i + k < n else -1)

        sa.sort(key=key)
        new = [0] * n
        for r in range(1, n):
            new[sa[r]] = new[sa[r - 1]] + (key(sa[r - 1]) < key(sa[r]))
        rank = new
        if rank[sa[-1]] == n - 1:  # every rank differs: sorted
            return sa
        k *= 2


def lcp_array(t, sa):
    """Kasai: lcp[r] is the longest common prefix of rows r - 1 and r (lcp[0] = 0)."""
    n = len(t)
    rank = [0] * n
    for r, i in enumerate(sa):
        rank[i] = r
    lcp = [0] * n
    h = 0
    for i in range(n):
        if rank[i] == 0:
            h = 0
            continue
        j = sa[rank[i] - 1]
        while i + h < n and j + h < n and t[i + h] == t[j + h]:
            h += 1
        lcp[rank[i]] = h
        if h > 0:
            h -= 1
    return lcp


def search(t, sa, p):
    """Positions where p occurs in t, in increasing order: two binary searches."""
    m = len(p)
    lo, hi = 0, len(sa)
    while lo < hi:  # the first row not smaller than p
        mid = (lo + hi) // 2
        if t[sa[mid] : sa[mid] + m] < p:
            lo = mid + 1
        else:
            hi = mid
    first, hi = lo, len(sa)
    while lo < hi:  # the first row past the ones that start with p
        mid = (lo + hi) // 2
        if t[sa[mid] : sa[mid] + m] <= p:
            lo = mid + 1
        else:
            hi = mid
    return sorted(sa[first:lo])


def longest_repeat(t, sa, lcp):
    """The longest substring that occurs at least twice ('' if none)."""
    best = 0
    for r in range(1, len(lcp)):
        if lcp[r] > lcp[best]:
            best = r
    return t[sa[best] : sa[best] + lcp[best]] if lcp else ""

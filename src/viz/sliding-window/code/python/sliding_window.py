def max_sum(a, k):
    """The largest sum of k values in a row, and where that window starts."""
    s = sum(a[:k])
    best, at = s, 0
    for r in range(k, len(a)):
        s += a[r] - a[r - k]  # a[r] enters, a[r - k] leaves
        if s > best:
            best, at = s, r - k + 1
    return best, at


def shortest_at_least(a, target):
    """Length of the shortest window with sum >= target (values >= 0), or 0."""
    best = len(a) + 1
    left = s = 0
    for right, v in enumerate(a):
        s += v
        while s >= target:
            best = min(best, right - left + 1)
            s -= a[left]
            left += 1
    return 0 if best > len(a) else best


def longest_distinct(a):
    """Length and start of the longest window with no repeated value."""
    count = {}
    best = at = left = 0
    for right, v in enumerate(a):
        count[v] = count.get(v, 0) + 1
        while count[v] > 1:
            count[a[left]] -= 1
            left += 1
        if right - left + 1 > best:
            best, at = right - left + 1, left
    return best, at

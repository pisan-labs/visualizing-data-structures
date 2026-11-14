def merge(intervals):
    """Merge overlapping intervals [start, end]; touching ends merge too. O(n log n)."""
    out = []
    for start, end in sorted(intervals):  # by start
        if out and start <= out[-1][1]:  # reaches the last one out
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])  # starts after it: a new one
    return out


def insert(intervals, new):
    """Insert new into a sorted list of intervals that do not overlap. O(n)."""
    start, end = new
    out, i, n = [], 0, len(intervals)
    while i < n and intervals[i][1] < start:  # ends before new starts: copy
        out.append(intervals[i])
        i += 1
    while i < n and intervals[i][0] <= end:  # overlaps new: absorb it
        start = min(start, intervals[i][0])
        end = max(end, intervals[i][1])
        i += 1
    out.append([start, end])
    out.extend(intervals[i:])  # the rest start after new ends
    return out


def intersect(a, b):
    """What two sorted lists of non-overlapping intervals have in common. O(m + n)."""
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        lo = max(a[i][0], b[j][0])
        hi = min(a[i][1], b[j][1])
        if lo <= hi:
            out.append([lo, hi])
        if a[i][1] < b[j][1]:  # the one that ends first can meet nothing more
            i += 1
        else:
            j += 1
    return out

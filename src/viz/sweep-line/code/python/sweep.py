import heapq


def most_open(intervals):
    """The most intervals [start, end) open at once. O(n log n)."""
    events = [(s, 1) for s, e in intervals] + [(e, -1) for s, e in intervals]
    events.sort()  # by time; at equal times -1 sorts first: ends before starts
    open_now = best = 0
    for _, change in events:
        open_now += change
        best = max(best, open_now)
    return best


def skyline(buildings):
    """Key points (x, height) of the outline of buildings (left, right, height). O(n log n)."""
    xs = sorted({x for left, right, _ in buildings for x in (left, right)})
    by_left = sorted(buildings)
    heap, out, i = [], [], 0  # heap of (-height, right): the tallest on top
    for x in xs:
        while i < len(by_left) and by_left[i][0] == x:  # push what starts here
            left, right, height = by_left[i]
            heapq.heappush(heap, (-height, right))
            i += 1
        while heap and heap[0][1] <= x:  # pop what has ended (lazy removal)
            heapq.heappop(heap)
        height = -heap[0][0] if heap else 0
        if height != (out[-1][1] if out else 0):
            out.append((x, height))
    return out

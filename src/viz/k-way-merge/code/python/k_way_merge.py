import heapq


def merge_lists(lists):
    """Merge sorted lists into one sorted list. O(n log k) for n values in k lists."""
    # One entry per list: (head value, list number, position). The list number breaks ties,
    # so equal values go out in list order and the tuples never compare further.
    heap = [(lst[0], j, 0) for j, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        x, j, i = heap[0]  # the smallest value left anywhere
        out.append(x)
        if i + 1 < len(lists[j]):
            heapq.heapreplace(heap, (lists[j][i + 1], j, i + 1))  # its list's next value
        else:
            heapq.heappop(heap)  # that list is used up
    return out

import heapq


def top_k(a, k):
    """The k largest values of a, in heap order. O(n log k) time, O(k) extra space."""
    heap = []  # a min-heap of the best k so far: heap[0] is the one to beat
    for x in a:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)  # drop the root, put x in, sift it down
    return heap


def kth_largest(a, k):
    """The k-th largest value of a (k = 1 is the largest): the root of that heap."""
    return top_k(a, k)[0]

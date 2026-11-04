def heap_sort(a):
    """Sort the list a in place, smallest first.

    Python lists start at 0, so this is the page's "from 0" indexing: the
    children of a[i] are a[2i + 1] and a[2i + 2]. a[0:size] is the heap and
    a[size:] is the sorted part.
    """
    n = len(a)
    # Phase 1: build a max-heap, from the last node with a child back to the root.
    for i in range(n // 2 - 1, -1, -1):
        max_heapify(a, i, n)
    # Phase 2: move the largest value to the end, shrink the heap, fix the root.
    for last in range(n - 1, 0, -1):
        a[0], a[last] = a[last], a[0]
        max_heapify(a, 0, last)


def max_heapify(a, i, size):
    """Sift a[i] down the heap a[0:size] until neither child is bigger."""
    while True:
        left, right = 2 * i + 1, 2 * i + 2
        largest = i
        if left < size and a[left] > a[largest]:
            largest = left
        if right < size and a[right] > a[largest]:
            largest = right
        if largest == i:
            return
        a[i], a[largest] = a[largest], a[i]
        i = largest

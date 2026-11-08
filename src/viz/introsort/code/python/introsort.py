SMALL = 3  # parts this small go to insertion sort (libraries use 16)


def introsort(a):
    """Sort the list a in place: quicksort with a depth budget of
    2 * floor(log2 n), heap sort when the budget runs out, and
    insertion sort for small parts."""
    if len(a) > 1:
        _loop(a, 0, len(a) - 1, 2 * (len(a).bit_length() - 1))


def _loop(a, p, r, limit):
    if r - p + 1 <= SMALL:
        _insertion_sort(a, p, r)
    elif limit == 0:
        _heap_sort(a, p, r)
    else:
        q = _partition(a, p, r)
        _loop(a, p, q - 1, limit - 1)
        _loop(a, q + 1, r, limit - 1)


def _partition(a, p, r):
    """Lomuto's partition around the median of a[p], a[mid] and a[r]."""
    mid = (p + r) // 2
    m = sorted([p, mid, r], key=lambda k: (a[k], k))[1]
    a[m], a[r] = a[r], a[m]
    x, i = a[r], p - 1
    for j in range(p, r):
        if a[j] <= x:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[r] = a[r], a[i + 1]
    return i + 1


def _insertion_sort(a, p, r):
    for i in range(p + 1, r + 1):
        j = i
        while j > p and a[j - 1] > a[j]:
            a[j - 1], a[j] = a[j], a[j - 1]
            j -= 1


def _heap_sort(a, p, r):
    n = r - p + 1

    def sift_down(i, size):
        while 2 * i + 1 < size:
            big = 2 * i + 1
            if big + 1 < size and a[p + big + 1] > a[p + big]:
                big += 1
            if a[p + big] <= a[p + i]:
                return
            a[p + i], a[p + big] = a[p + big], a[p + i]
            i = big

    for i in range(n // 2 - 1, -1, -1):
        sift_down(i, n)
    for end in range(n - 1, 0, -1):
        a[p], a[p + end] = a[p + end], a[p]
        sift_down(0, end)

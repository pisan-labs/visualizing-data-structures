def bucket_sort(a, lo=0.0, hi=1.0):
    """Sort values in [lo, hi): n buckets of equal width, insertion sort in each, then join."""
    n = len(a)
    buckets = [[] for _ in range(n)]
    for x in a:
        buckets[min(n - 1, int(n * (x - lo) / (hi - lo)))].append(x)
    for bucket in buckets:
        insertion_sort(bucket)
    a[:] = [x for bucket in buckets for x in bucket]


def insertion_sort(b):
    for i in range(1, len(b)):
        key = b[i]
        j = i - 1
        while j >= 0 and b[j] > key:
            b[j + 1] = b[j]
            j -= 1
        b[j + 1] = key

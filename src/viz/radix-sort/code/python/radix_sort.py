def radix_sort(a, base=10):
    """LSD radix sort of whole numbers >= 0: one stable pass per digit, last digit first."""
    if not a:
        return
    largest = max(a)
    place = 1
    while True:
        buckets = [[] for _ in range(base)]
        for x in a:  # left to right, to the back of each bucket: stable
            buckets[x // place % base].append(x)
        a[:] = [x for bucket in buckets for x in bucket]
        place *= base
        if largest < place:
            break

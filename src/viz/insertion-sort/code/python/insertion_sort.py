def insertion_sort(a):
    """Sort the list a in place, smallest first.

    a[0..i-1] is always sorted. Take key = a[i], shift the larger values in
    the sorted part one slot right, and drop key into the gap.
    """
    for i in range(1, len(a)):
        key = a[i]
        j = i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key

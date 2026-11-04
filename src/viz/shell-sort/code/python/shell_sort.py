def shell_sort(a):
    """Sort the list a in place, smallest first, with Shell's gaps n/2, n/4, ..., 1.

    For each gap h, insertion sort every list of values h apart. The last
    gap is 1, a plain insertion sort on an array that is nearly sorted.
    """
    n = len(a)
    h = n // 2
    while h > 0:
        for i in range(h, n):
            temp = a[i]
            j = i
            while j >= h and a[j - h] > temp:
                a[j] = a[j - h]
                j -= h
            a[j] = temp
        h //= 2

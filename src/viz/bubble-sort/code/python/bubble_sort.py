def bubble_sort(a):
    """Sort the list a in place, smallest first.

    Each pass walks j from the back to the front and swaps neighbors that are
    out of order, so after pass i the i + 1 smallest values are in a[0..i].
    """
    n = len(a)
    for i in range(n - 1):
        for j in range(n - 1, i, -1):
            if a[j] < a[j - 1]:
                a[j], a[j - 1] = a[j - 1], a[j]

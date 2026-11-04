def selection_sort(a):
    """Sort the list a in place, smallest first.

    Pass i finds the smallest value in a[i..n-1] and swaps it into a[i],
    so after pass i the i + 1 smallest values are in their final places.
    """
    n = len(a)
    for i in range(n - 1):
        smallest = i
        for j in range(i + 1, n):
            if a[j] < a[smallest]:
                smallest = j
        a[i], a[smallest] = a[smallest], a[i]

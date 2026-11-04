def merge_sort(a, p=0, r=None):
    """Sort a[p..r] in place (r included), smallest first."""
    if r is None:
        r = len(a) - 1
    if p >= r:
        return
    q = (p + r) // 2
    merge_sort(a, p, q)
    merge_sort(a, q + 1, r)
    merge(a, p, q, r)


def merge(a, p, q, r):
    """Merge the sorted runs a[p..q] and a[q+1..r] into a[p..r]."""
    left = a[p:q + 1]
    right = a[q + 1:r + 1]
    i = j = 0
    k = p
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            a[k] = left[i]
            i += 1
        else:
            a[k] = right[j]
            j += 1
        k += 1
    while i < len(left):
        a[k] = left[i]
        i += 1
        k += 1
    while j < len(right):
        a[k] = right[j]
        j += 1
        k += 1

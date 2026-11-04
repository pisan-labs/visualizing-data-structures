def counting_sort(a):
    """Sort whole numbers from 0 to k = max(a) in place, smallest first, without comparing."""
    if not a:
        return
    k = max(a)
    count = [0] * (k + 1)
    for x in a:
        count[x] += 1
    for i in range(1, k + 1):
        count[i] += count[i - 1]  # now count[i] is how many values are <= i
    out = [0] * len(a)
    for x in reversed(a):  # from the right, so equal values keep their order
        count[x] -= 1
        out[count[x]] = x
    a[:] = out

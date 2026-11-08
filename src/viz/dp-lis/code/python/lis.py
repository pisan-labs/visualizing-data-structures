from bisect import bisect_left


def _walk_back(a, prev, i):
    out = []
    while i != -1:
        out.append(a[i])
        i = prev[i]
    return out[::-1]


def lis_table(a):
    """O(n^2): length[i] is the longest increasing run ending at a[i]; prev[i] the index before."""
    n = len(a)
    length = [1] * n
    prev = [-1] * n
    for i in range(n):
        for j in range(i):
            if a[j] < a[i] and length[j] + 1 > length[i]:
                length[i] = length[j] + 1
                prev[i] = j
    end = length.index(max(length))  # the first position with the largest length
    return _walk_back(a, prev, end)


def lis_tails(a):
    """O(n log n): tails[k] is the index of the smallest value ending a run of length k + 1."""
    tails = []  # indices into a
    tail_values = []  # a[tails[k]], kept sorted for binary search
    prev = [-1] * len(a)
    for i, x in enumerate(a):
        k = bisect_left(tail_values, x)  # the first tail >= x
        prev[i] = tails[k - 1] if k > 0 else -1
        if k == len(tails):
            tails.append(i)
            tail_values.append(x)
        else:
            tails[k] = i
            tail_values[k] = x
    return _walk_back(a, prev, tails[-1])

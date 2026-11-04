def edit_table(a, b, ins=1, dele=1, sub=1):
    """d[i][j] is the cheapest way to turn a[:i] into b[:j]."""
    m, n = len(a), len(b)
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        d[i][0] = i * dele
    for j in range(n + 1):
        d[0][j] = j * ins
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else sub
            d[i][j] = min(d[i - 1][j - 1] + cost, d[i - 1][j] + dele, d[i][j - 1] + ins)
    return d


def edit_distance(a, b, ins=1, dele=1, sub=1):
    return edit_table(a, b, ins, dele, sub)[len(a)][len(b)]


def alignment(a, b, ins=1, dele=1, sub=1):
    """The edits from left to right: M match, S substitute, D delete, I insert."""
    d = edit_table(a, b, ins, dele, sub)
    i, j = len(a), len(b)
    ops = []
    while i > 0 or j > 0:
        same = i > 0 and j > 0 and a[i - 1] == b[j - 1]
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (0 if same else sub):
            ops.append("M" if same else "S")
            i, j = i - 1, j - 1
        elif i > 0 and d[i][j] == d[i - 1][j] + dele:
            ops.append("D")
            i -= 1
        else:
            ops.append("I")
            j -= 1
    return "".join(reversed(ops))

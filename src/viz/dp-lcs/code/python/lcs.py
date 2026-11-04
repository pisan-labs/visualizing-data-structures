def lcs_table(x, y):
    """c[i][j] is the length of an LCS of x[:i] and y[:j]."""
    m, n = len(x), len(y)
    c = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if x[i - 1] == y[j - 1]:
                c[i][j] = c[i - 1][j - 1] + 1
            else:
                c[i][j] = max(c[i - 1][j], c[i][j - 1])
    return c


def lcs(x, y):
    """One longest common subsequence of x and y. On a tie the walk goes up, as in CLRS."""
    c = lcs_table(x, y)
    i, j = len(x), len(y)
    taken = []
    while i > 0 and j > 0:
        if x[i - 1] == y[j - 1]:
            taken.append(x[i - 1])
            i, j = i - 1, j - 1
        elif c[i - 1][j] >= c[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return "".join(reversed(taken))

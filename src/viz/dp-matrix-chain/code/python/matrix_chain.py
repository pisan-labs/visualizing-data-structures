def matrix_chain_order(p):
    """m[i][j]: fewest scalar multiplications for A(i+1)..A(j+1), where Ak is p[k-1] x p[k].

    s[i][j] is the split k (1-based): (A(i+1)..Ak)(A(k+1)..A(j+1)).
    """
    n = len(p) - 1
    m = [[0] * n for _ in range(n)]
    s = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            m[i][j] = float("inf")
            for k in range(i + 1, j + 1):
                q = m[i][k - 1] + m[k][j] + p[i] * p[k] * p[j + 1]
                if q < m[i][j]:
                    m[i][j] = q
                    s[i][j] = k
    return m, s


def parens(s, i, j):
    """The best order for A(i+1)..A(j+1) as nested brackets."""
    if i == j:
        return f"A{i + 1}"
    k = s[i][j]
    return "(" + parens(s, i, k - 1) + parens(s, k, j) + ")"

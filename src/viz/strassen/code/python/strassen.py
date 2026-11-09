def strassen(A, B, count):
    """Strassen's algorithm for n x n matrices, n a power of 2 (CLRS 4.2).

    count is a dict that collects the scalar multiplications ("mul") and additions ("add").
    """
    n = len(A)
    if n == 1:
        count["mul"] += 1
        return [[A[0][0] * B[0][0]]]
    h = n // 2

    def block(M, i, j):
        return [row[j * h : (j + 1) * h] for row in M[i * h : (i + 1) * h]]

    def add(X, Y, sign=1):
        count["add"] += h * h
        return [[x + sign * y for x, y in zip(rx, ry)] for rx, ry in zip(X, Y)]

    A11, A12, A21, A22 = block(A, 0, 0), block(A, 0, 1), block(A, 1, 0), block(A, 1, 1)
    B11, B12, B21, B22 = block(B, 0, 0), block(B, 0, 1), block(B, 1, 0), block(B, 1, 1)
    S1, S2, S3 = add(B12, B22, -1), add(A11, A12), add(A21, A22)
    S4, S5, S6 = add(B21, B11, -1), add(A11, A22), add(B11, B22)
    S7, S8 = add(A12, A22, -1), add(B21, B22)
    S9, S10 = add(A11, A21, -1), add(B11, B12)
    P1 = strassen(A11, S1, count)
    P2 = strassen(S2, B22, count)
    P3 = strassen(S3, B11, count)
    P4 = strassen(A22, S4, count)
    P5 = strassen(S5, S6, count)
    P6 = strassen(S7, S8, count)
    P7 = strassen(S9, S10, count)
    C11 = add(add(add(P5, P4), P2, -1), P6)
    C12 = add(P1, P2)
    C21 = add(P3, P4)
    C22 = add(add(add(P5, P1), P3, -1), P7, -1)
    return [a + b for a, b in zip(C11, C12)] + [a + b for a, b in zip(C21, C22)]


def multiply(A, B):
    """Pad A and B with zeros to a power of 2, multiply, and cut the padding off again."""
    n = len(A)
    N = 1
    while N < n:
        N *= 2

    def pad(M):
        return [row + [0] * (N - n) for row in M] + [[0] * N for _ in range(N - n)]

    count = {"mul": 0, "add": 0}
    C = strassen(pad(A), pad(B), count)
    return [row[:n] for row in C[:n]], count

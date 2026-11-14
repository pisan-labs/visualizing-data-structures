def best_removal(tiles):
    """Best total for taking every tile, each scoring itself times its two current neighbours
    (the ends count as 1), and the order to take them, by position from 1."""
    n = len(tiles)
    v = [1] + tiles + [1]  # v[1..n] are the tiles; v[0] and v[n + 1] are the posts
    B = [[0] * (n + 2) for _ in range(n + 2)]  # B[a][b]: best for tiles a..b, 0 if a > b
    K = [[0] * (n + 2) for _ in range(n + 2)]  # the tile taken last in a..b
    for length in range(1, n + 1):  # shorter stretches first
        for a in range(1, n - length + 2):
            b = a + length - 1
            for k in range(a, b + 1):  # k goes last, between a - 1 and b + 1
                score = B[a][k - 1] + B[k + 1][b] + v[a - 1] * v[k] * v[b + 1]
                if k == a or score > B[a][b]:
                    B[a][b], K[a][b] = score, k
    order = []

    def take(a, b):  # both sides of the last tile first, then the tile
        if a <= b:
            k = K[a][b]
            take(a, k - 1)
            take(k + 1, b)
            order.append(k)

    take(1, n)
    return B[1][n], order


def cheapest_merge(piles):
    """Least total cost to merge neighbouring piles into one, a merge costing the two sizes
    added, and the merges as brackets of pile sizes."""
    n = len(piles)
    pre = [0]
    for x in piles:
        pre.append(pre[-1] + x)  # pre[b + 1] - pre[a] is the size of piles a..b
    M = [[0] * n for _ in range(n)]  # M[a][b]: least cost for piles a..b; 0 for one pile
    K = [[0] * n for _ in range(n)]  # the last merge joins a..K[a][b] with the rest
    for length in range(2, n + 1):
        for a in range(n - length + 1):
            b = a + length - 1
            for k in range(a, b):
                cost = M[a][k] + M[k + 1][b] + pre[b + 1] - pre[a]
                if k == a or cost < M[a][b]:
                    M[a][b], K[a][b] = cost, k

    def brackets(a, b):
        if a == b:
            return str(piles[a])
        k = K[a][b]
        return f"({brackets(a, k)} {brackets(k + 1, b)})"

    return M[0][n - 1], brackets(0, n - 1)

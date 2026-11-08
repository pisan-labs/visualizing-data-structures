def cut_rod_table(prices):
    """Bottom-up: r[j] is the best revenue for length j, s[j] the first piece of a best cut.

    prices[i - 1] is the price of a piece of length i.
    """
    n = len(prices)
    p = [0] + prices
    r = [0] * (n + 1)
    s = [0] * (n + 1)
    for j in range(1, n + 1):
        q = -1
        for i in range(1, j + 1):
            if q < p[i] + r[j - i]:
                q = p[i] + r[j - i]
                s[j] = i
        r[j] = q
    return r, s


def cut_rod(prices):
    """The best revenue and the pieces that earn it, first piece first."""
    r, s = cut_rod_table(prices)
    pieces = []
    n = len(prices)
    while n > 0:
        pieces.append(s[n])
        n -= s[n]
    return r[len(prices)], pieces

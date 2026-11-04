import math


def fewest_coins(coins, amount):
    """The coins that pay amount with as few as possible, or None if it cannot be paid."""
    coins = sorted(coins)
    best = [0] + [math.inf] * amount  # best[a]: the fewest coins that make a
    last = [0] * (amount + 1)  # last[a]: the coin best[a] used last
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
                last[a] = c
    if best[amount] == math.inf:
        return None
    paid = []
    while amount > 0:
        paid.append(last[amount])
        amount -= last[amount]
    return paid


def count_ways(coins, amount):
    """How many ways there are to make amount, ignoring the order of the coins."""
    ways = [1] + [0] * amount  # one row of the table, updated one coin at a time
    for c in sorted(coins):
        for a in range(c, amount + 1):
            ways[a] += ways[a - c]
    return ways[amount]

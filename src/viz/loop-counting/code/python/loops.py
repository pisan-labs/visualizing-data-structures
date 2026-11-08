"""Loop patterns. Each returns how many times its innermost line runs."""


def single(n):
    count = 0
    for i in range(1, n + 1):
        count += 1
    return count


def nested(n):
    count = 0
    for i in range(1, n + 1):
        for j in range(1, n + 1):
            count += 1
    return count


def triangle(n):
    count = 0
    for i in range(1, n + 1):
        for j in range(i, n + 1):  # j = i to n
            count += 1
    return count


def pairs(n):
    count = 0
    for i in range(1, n + 1):
        for j in range(1, i):  # j = 1 to i - 1
            count += 1
    return count


def sequence(n):
    count = 0
    for i in range(1, n + 1):
        count += 1
    for j in range(1, n + 1):  # starts after the first loop ends
        count += 1
    return count


def halving(n):
    count = 0
    i = n
    while i > 1:
        count += 1
        i //= 2
    return count


def square_root(n):
    count = 0
    i = 1
    while i * i <= n:
        count += 1
        i += 1
    return count


def doubling(n):
    count = 0
    for i in range(1, n + 1):
        j = 1
        while j <= n:
            count += 1
            j *= 2
    return count


def geometric(n):
    count = 0
    i = 1
    while i <= n:
        for j in range(1, i + 1):
            count += 1
        i *= 2
    return count


def search(a, x):
    """Looks for x in a and returns the number of comparisons made."""
    count = 0
    for item in a:
        count += 1
        if item == x:
            return count  # the early exit
    return count


def triple(n):
    count = 0
    for i in range(1, n + 1):
        for j in range(i, n + 1):
            for k in range(j, n + 1):
                count += 1
    return count

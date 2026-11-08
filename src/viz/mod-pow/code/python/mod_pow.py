def mod_pow(a, b, m):
    """a^b mod m by square-and-multiply, reading the bits of b from the left."""
    d = 1 % m
    for bit in bin(b)[2:]:
        d = d * d % m  # doubles the exponent so far
        if bit == "1":
            d = d * a % m  # adds one to it
    return d

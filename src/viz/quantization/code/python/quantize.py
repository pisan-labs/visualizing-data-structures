import math


def round_half_away(x):
    """The nearest whole number; halves go away from zero."""
    return int(math.copysign(math.floor(abs(x) + 0.5), x))


def scale_for(values, bits, scheme):
    """The scaling constant s and the zero point z for one group of weights."""
    if scheme == "absmax":
        qmax = 2 ** (bits - 1) - 1  # 127 for int8, 7 for int4
        m = 0.0
        for v in values:
            m = max(m, abs(v))
        return (qmax / m if m > 0 else 1.0), 0
    qmax = 2 ** bits - 1  # 255 for int8, 15 for int4
    lo, hi = min(0.0, min(values)), max(0.0, max(values))  # 0 stays in the range
    s = qmax / (hi - lo) if hi > lo else 1.0
    return s, round_half_away(-lo * s)


def quantize(w, s, z, bits, scheme):
    q = round_half_away(s * w)
    if scheme == "absmax":
        return q
    return max(0, min(2 ** bits - 1, q + z))


def dequantize(q, s, z):
    return (q - z) / s


def groups(rows, cols, group):
    """The cells of each group: the whole matrix, each row, or blocks along a row."""
    if group == "tensor":
        return [[(r, c) for r in range(rows) for c in range(cols)]]
    if group == "row":
        return [[(r, c) for c in range(cols)] for r in range(rows)]
    size = int(group)
    return [[(r, c) for c in range(b, b + size)]
            for r in range(rows) for b in range(0, cols, size)]


def quantize_matrix(W, bits, scheme, group):
    """Codes and decoded weights for a matrix, one scale per group."""
    rows, cols = len(W), len(W[0])
    codes = [[0] * cols for _ in range(rows)]
    decoded = [[0.0] * cols for _ in range(rows)]
    for cells in groups(rows, cols, group):
        s, z = scale_for([W[r][c] for r, c in cells], bits, scheme)
        for r, c in cells:
            codes[r][c] = quantize(W[r][c], s, z, bits, scheme)
            decoded[r][c] = dequantize(codes[r][c], s, z)
    return codes, decoded

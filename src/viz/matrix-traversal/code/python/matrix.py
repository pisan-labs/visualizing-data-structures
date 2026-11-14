def spiral_order(m):
    """The values of a matrix in spiral order: clockwise from the top left, ring by ring.
    Four bounds mark the part not visited yet; O(1) extra space besides the answer."""
    out = []
    top, bottom, left, right = 0, len(m) - 1, 0, len(m[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            out.append(m[top][c])
        top += 1
        for r in range(top, bottom + 1):
            out.append(m[r][right])
        right -= 1
        if top <= bottom:  # a row is left for the bottom side
            for c in range(right, left - 1, -1):
                out.append(m[bottom][c])
            bottom -= 1
        if left <= right:  # a column is left for the left side
            for r in range(bottom, top - 1, -1):
                out.append(m[r][left])
            left += 1
    return out


def rotate(m):
    """Turn a square matrix a quarter turn clockwise, in place, one ring at a time."""
    n = len(m)
    for layer in range(n // 2):
        first, last = layer, n - 1 - layer
        for k in range(last - first):
            tmp = m[first][first + k]
            m[first][first + k] = m[last - k][first]  # left to top
            m[last - k][first] = m[last][last - k]  # bottom to left
            m[last][last - k] = m[first + k][last]  # right to bottom
            m[first + k][last] = tmp  # top to right

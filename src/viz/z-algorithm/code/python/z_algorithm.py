# The Z-algorithm. z[i] is the length of the longest substring starting
# at s[i] that is also a prefix of s. The box [l, r] is the match that
# reaches furthest right so far: s[l..r] == s[0..r - l].


def z_array(s):
    """z[i] for every i; z[0] is left 0."""
    n = len(s)
    z = [0] * n
    l = r = 0
    for i in range(1, n):
        if i <= r:  # inside the box: copy from the mirror, cut off at r
            z[i] = min(r - i + 1, z[i - l])
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] - 1 > r:  # reaches further right: the new box
            l, r = i, i + z[i] - 1
    return z


def z_search(text, pattern):
    """Every shift where pattern occurs in text, via z on pattern$text."""
    m = len(pattern)
    z = z_array(pattern + "$" + text)
    return [i - m - 1 for i in range(m + 1, len(z)) if z[i] == m]

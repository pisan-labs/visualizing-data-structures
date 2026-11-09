def val(c):
    """a = 1, b = 2, ..., z = 26 (not 0, or "b" and "ab" would collide)."""
    return ord(c) - ord("a") + 1


class PrefixHash:
    """h(s) = s[0]*b^(m-1) + s[1]*b^(m-2) + ... + s[m-1], mod p, for every prefix of s."""

    def __init__(self, s, b, p):
        self.p = p
        self.h = [0] * (len(s) + 1)  # h[k] = hash of s[0..k-1]
        self.pw = [1] * (len(s) + 1)  # pw[k] = b^k mod p
        for i, c in enumerate(s):
            self.h[i + 1] = (self.h[i] * b + val(c)) % p
            self.pw[i + 1] = self.pw[i] * b % p

    def get(self, l, r):
        """Hash of s[l..r], inclusive, in O(1)."""
        return (self.h[r + 1] - self.h[l] * self.pw[r - l + 1]) % self.p


def window_hashes(s, k, b, p):
    """The hash of every window of k characters, each rolled from the one before."""
    top = pow(b, k - 1, p)  # the weight of a window's first character
    h = 0
    for c in s[:k]:
        h = (h * b + val(c)) % p
    out = [h]
    for i in range(k, len(s)):
        h = ((h - val(s[i - k]) * top) * b + val(s[i])) % p
        out.append(h)
    return out

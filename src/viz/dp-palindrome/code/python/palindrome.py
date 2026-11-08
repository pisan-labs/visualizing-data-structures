def lps_table(s):
    """L[i][j] is the length of the longest palindromic subsequence of s[i..j]."""
    n = len(s)
    L = [[0] * n for _ in range(n)]
    for i in range(n):
        L[i][i] = 1
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            if s[i] == s[j]:
                L[i][j] = (L[i + 1][j - 1] if length > 2 else 0) + 2
            else:
                L[i][j] = max(L[i + 1][j], L[i][j - 1])
    return L


def longest_palindrome(s):
    """One longest palindromic subsequence, walking in from both ends."""
    L = lps_table(s)
    i, j = 0, len(s) - 1
    left, right = [], []
    while i <= j:
        if i == j:
            left.append(s[i])  # the middle
            i += 1
        elif s[i] == s[j]:
            left.append(s[i])
            right.append(s[j])
            i, j = i + 1, j - 1
        elif L[i + 1][j] >= L[i][j - 1]:
            i += 1  # drop the left end
        else:
            j -= 1  # drop the right end
    return "".join(left + right[::-1])

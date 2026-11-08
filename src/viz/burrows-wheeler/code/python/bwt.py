# The Burrows-Wheeler transform: sort every rotation of text + "$" and
# read the last column. The inverse needs only that column: the k-th
# copy of a character in L is the k-th copy in F = sorted(L).


def bwt(text):
    """The last column of the sorted rotations of text + '$'."""
    s = text + "$"
    rows = sorted(s[k:] + s[:k] for k in range(len(s)))
    return "".join(row[-1] for row in rows)


def lf_mapping(last):
    """lf[r]: the row of F holding the same copy of the character last[r]."""
    first = sorted(last)
    start = {}  # where each character's block begins in F
    for r, c in enumerate(first):
        start.setdefault(c, r)
    seen = {}
    lf = []
    for c in last:
        lf.append(start[c] + seen.get(c, 0))
        seen[c] = seen.get(c, 0) + 1
    return lf


def inverse_bwt(last):
    """The text whose transform is last (which holds one '$')."""
    lf = lf_mapping(last)
    text = ""
    r = 0  # row 0 starts with "$": it is "$" + text
    for _ in range(len(last) - 1):
        text = last[r] + text  # last[r] comes just before first[r]
        r = lf[r]
    return text


def bwt_index(text):
    """Without an end marker: the last column and the row of text."""
    rows = sorted(range(len(text)), key=lambda k: text[k:] + text[:k])
    return "".join(text[k - 1] for k in rows), rows.index(0)


def inverse_bwt_index(last, index):
    lf = lf_mapping(last)
    text = ""
    r = index
    for _ in range(len(last)):
        text = last[r] + text
        r = lf[r]
    return text

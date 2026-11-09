from collections import deque


def mismatch(top, bottom):
    """Where the two strings first disagree, or -1 if one is a prefix of the other."""
    for i, (a, b) in enumerate(zip(top, bottom)):
        if a != b:
            return i
    return -1


def overhang(top, bottom):
    """The longer side and what it has left over, such as "top +ca"."""
    k = min(len(top), len(bottom))
    return f"top +{top[k:]}" if len(top) > k else f"bottom +{bottom[k:]}"


def try_sequence(dominoes, seq):
    """Lay down the dominoes numbered in seq (from 1), stopping where the strings disagree."""
    top = bottom = ""
    for i in seq:
        top += dominoes[i - 1][0]
        bottom += dominoes[i - 1][1]
        at = mismatch(top, bottom)
        if at >= 0:
            return f"dead at column {at + 1}"
    return "match" if top == bottom else f"alive {overhang(top, bottom)}"


def search(dominoes, bound, limit=60):
    """Breadth-first search for a match of at most `bound` dominoes.

    dominoes is a list of (top, bottom) pairs. Returns the match as a list of domino numbers
    (from 1), or a string: "no match" when every branch died, "none up to <bound>" when some
    partial match was cut off at the bound, "gave up" after extending `limit` partial matches.
    """
    queue = deque([([], "", "")])
    cut = 0
    expanded = 0
    while queue:
        if expanded == limit:
            return "gave up"
        seq, top, bottom = queue.popleft()
        expanded += 1
        for i, (t, b) in enumerate(dominoes, start=1):
            longer, top2, bottom2 = seq + [i], top + t, bottom + b
            if mismatch(top2, bottom2) >= 0:
                continue  # dead: no dominoes added later can fix it
            if top2 == bottom2:
                return longer
            if len(longer) == bound:
                cut += 1  # alive, but as long as allowed
            else:
                queue.append((longer, top2, bottom2))
    return f"none up to {bound}" if cut else "no match"

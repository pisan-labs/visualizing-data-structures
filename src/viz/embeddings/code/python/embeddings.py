import heapq
import math


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def length(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1])


def cosine(a, b):
    """The cosine of the angle between a and b: 1 when they point the same way."""
    return dot(a, b) / (length(a) * length(b))


def normalize(a):
    n = length(a)
    return (a[0] / n, a[1] / n)


def nearest(words, target, k, measure="cosine", leave_out=()):
    """The k words most similar to target, best first, as (word, score).

    words is a list of (word, vector). A min-heap keeps the best k seen so far
    with the weakest on top, so a word that cannot get in costs one comparison.
    On equal scores the earlier word wins.
    """
    score = cosine if measure == "cosine" else dot
    heap = []  # (score, -index): the smallest entry is the weakest
    for i, (word, v) in enumerate(words):
        if word in leave_out:
            continue
        entry = (score(target, v), -i)
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)
    return [(words[-neg][0], s) for s, neg in sorted(heap, reverse=True)]


def analogy(words, a, b, c, k, measure="cosine"):
    """a - b + c, and the k words nearest to it other than a, b and c."""
    vec = dict(words)
    t = (vec[a][0] - vec[b][0] + vec[c][0], vec[a][1] - vec[b][1] + vec[c][1])
    return t, nearest(words, t, k, measure, leave_out={a, b, c})

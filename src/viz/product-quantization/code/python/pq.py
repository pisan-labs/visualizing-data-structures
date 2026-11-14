def dist2(a, b):
    """Squared distance between two vectors of the same length."""
    total = 0.0
    for x, y in zip(a, b):
        d = x - y
        total += d * d
    return total


def nearest(p, centres):
    """Index of the centre nearest to p; a tie goes to the lower index."""
    best = 0
    for j in range(1, len(centres)):
        if dist2(p, centres[j]) < dist2(p, centres[best]):
            best = j
    return best


def kmeans_pp(points, draws):
    """k-means++ seeding, one uniform number in [0, 1) per centre."""
    chosen = []
    for u in draws:
        if chosen:
            d2 = [min(dist2(p, points[j]) for j in chosen) for p in points]
            total = 0.0
            for x in d2:
                total += x
            if total > 0:
                run = 0.0
                for i, x in enumerate(d2):
                    run += x
                    if run > u * total:
                        chosen.append(i)
                        break
                continue
        pool = [i for i in range(len(points)) if i not in chosen]
        chosen.append(pool[int(u * len(pool))])
    return chosen


def update(points, labels, centres):
    """Each centre to the mean of its points. A centre with no points jumps to the
    point farthest from its own centre."""
    new = [list(c) for c in centres]
    empties = []
    for j in range(len(centres)):
        members = [p for p, c in zip(points, labels) if c == j]
        if not members:
            empties.append(j)
            continue
        s = [0.0] * len(members[0])
        for p in members:
            for i, x in enumerate(p):
                s[i] += x
        new[j] = [x / len(members) for x in s]
    taken = set()
    for j in empties:
        far, far_d = -1, 0
        for i, p in enumerate(points):
            d = dist2(p, new[labels[i]])
            if i not in taken and d > far_d:
                far, far_d = i, d
        if far >= 0:
            taken.add(far)
            new[j] = list(points[far])
    return new


def kmeans(points, centres, max_rounds=20):
    """Lloyd's algorithm: assign, move, until no point changes cluster."""
    labels = None
    for _ in range(max_rounds):
        new = [nearest(p, centres) for p in points]
        if new == labels:
            break
        labels = new
        centres = update(points, labels, centres)
    return centres


class PQ:
    """Product quantization: m codebooks of k centres, one per piece of the vector."""

    def __init__(self, m, k):
        self.m, self.k = m, k
        self.books = []

    def piece(self, v, j):
        w = len(v) // self.m
        return v[j * w:(j + 1) * w]

    def train(self, vectors, draws):
        """k-means on each piece; draws holds k numbers per piece for k-means++."""
        self.books = []
        for j in range(self.m):
            sub = [self.piece(v, j) for v in vectors]
            seeds = kmeans_pp(sub, draws[j * self.k:(j + 1) * self.k])
            self.books.append(kmeans(sub, [sub[i] for i in seeds]))

    def encode(self, v):
        """The code: the nearest centre of each piece."""
        return [nearest(self.piece(v, j), book) for j, book in enumerate(self.books)]

    def table(self, q):
        """table[j][c]: d² from the query's piece j to centre c of codebook j."""
        return [[dist2(self.piece(q, j), c) for c in book]
                for j, book in enumerate(self.books)]

    def search(self, q, codes, k):
        """Asymmetric distance to every code, by table lookups; the k nearest."""
        t = self.table(q)
        dists = []
        for code in codes:
            total = 0.0
            for j, c in enumerate(code):
                total += t[j][c]
            dists.append(total)
        order = sorted(range(len(codes)), key=lambda i: (dists[i], i))
        return dists, order[:k]

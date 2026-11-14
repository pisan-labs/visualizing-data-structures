def dist2(a, b):
    """Squared distance between two points (x, y)."""
    dx, dy = a[0] - b[0], a[1] - b[1]
    return dx * dx + dy * dy


def nearest(p, centres):
    """Index of the centre nearest to p; a tie goes to the lower index."""
    best = 0
    for j in range(1, len(centres)):
        if dist2(p, centres[j]) < dist2(p, centres[best]):
            best = j
    return best


def move(points, labels, centres):
    """Each centre to the mean of its points. A centre with no points jumps to the
    point farthest from its own centre."""
    new = list(centres)
    empties = []
    for j in range(len(centres)):
        members = [p for p, c in zip(points, labels) if c == j]
        if not members:
            empties.append(j)
            continue
        sx = sy = 0
        for x, y in members:
            sx += x
            sy += y
        new[j] = (sx / len(members), sy / len(members))
    taken = set()
    for j in empties:
        far, far_d = -1, 0
        for i, p in enumerate(points):
            d = dist2(p, new[labels[i]])
            if i not in taken and d > far_d:
                far, far_d = i, d
        if far >= 0:
            taken.add(far)
            new[j] = points[far]
    return new


def kmeans(points, centres, max_rounds=20):
    """Lloyd's algorithm from the starting centres (here, k-means++ picks them)."""
    labels = None
    for _ in range(max_rounds):
        new = [nearest(p, centres) for p in points]
        if new == labels:
            break
        labels = new
        centres = move(points, labels, centres)
    return centres


class IVFIndex:
    """An inverted file: the points filed in one list per centre."""

    def __init__(self, points, centres):
        self.points = points
        self.centres = centres
        self.lists = [[] for _ in centres]
        for i, p in enumerate(points):
            self.lists[nearest(p, centres)].append(i)

    def search(self, q, k, nprobe):
        """The k nearest points (indices) in the nprobe lists whose centres are
        nearest to q, and how many distances that took."""
        d = [dist2(q, c) for c in self.centres]
        order = sorted(range(len(d)), key=lambda j: (d[j], j))
        count = len(d)
        found = []
        for j in order[:nprobe]:
            for i in self.lists[j]:
                found.append((dist2(q, self.points[i]), i))
                count += 1
        found.sort()
        return [i for _, i in found[:k]], count

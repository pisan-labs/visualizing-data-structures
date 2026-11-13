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


def assign(points, centres):
    return [nearest(p, centres) for p in points]


def update(points, labels, centres, empty="farthest"):
    """Move each centre to the mean of its points. A centre with no points jumps to
    the point farthest from its own centre ("farthest") or stays put ("stay")."""
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
        if empty != "farthest":
            continue
        far, far_d = -1, 0
        for i, p in enumerate(points):
            d = dist2(p, new[labels[i]])
            if i not in taken and d > far_d:
                far, far_d = i, d
        if far >= 0:  # if every point sits on its centre, stay put
            taken.add(far)
            new[j] = points[far]
    return new


def wcss(points, labels, centres):
    """Within-cluster sum of squares: what Lloyd's algorithm makes smaller."""
    total = 0.0
    for p, c in zip(points, labels):
        total += dist2(p, centres[c])
    return total


def random_seeds(points, k, rand):
    """k different points, each equally likely. rand() is uniform in [0, 1)."""
    pool = list(range(len(points)))
    return [pool.pop(int(rand() * len(pool))) for _ in range(k)]


def kmeans_pp(points, k, rand):
    """k-means++ seeding (Arthur and Vassilvitskii 2007): after a uniform first
    centre, each point x is picked with probability D(x)^2 / (sum of all D^2)."""
    chosen = [int(rand() * len(points))]
    d2 = [dist2(p, points[chosen[0]]) for p in points]
    while len(chosen) < k:
        u = rand()
        total = 0
        for x in d2:
            total += x
        if total == 0:  # every point sits on a centre: draw uniformly
            pool = [i for i in range(len(points)) if i not in chosen]
            pick = pool[int(u * len(pool))]
        else:
            target, run, pick = u * total, 0, 0
            for i, x in enumerate(d2):
                run += x
                if run > target:
                    pick = i
                    break
        chosen.append(pick)
        d2 = [min(d, dist2(p, points[pick])) for d, p in zip(d2, points)]
    return chosen


def lloyd(points, centres, labels=None, empty="farthest", max_rounds=20):
    """Assign and update until an assignment changes nothing.
    Returns the centres, the labels and the number of assignment rounds."""
    for rounds in range(1, max_rounds + 1):
        new_labels = assign(points, centres)
        if new_labels == labels:
            return centres, labels, rounds
        labels = new_labels
        centres = update(points, labels, centres, empty)
    return centres, labels, max_rounds

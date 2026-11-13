import heapq
import math
import random


def dist2(a, b):
    dx, dy = a[0] - b[0], a[1] - b[1]
    return dx * dx + dy * dy


class HNSW:
    """Hierarchical navigable small world graph (Malkov and Yashunin 2018).
    Lists of (distance, id) pairs break ties by id, the point inserted first."""

    def __init__(self, m=2, ef_construction=4):
        self.m, self.ef_construction = m, ef_construction
        self.points = []  # (x, y) by id
        self.links = []  # links[id][layer]: neighbour ids
        self.entry = None
        self.distances = 0  # computed by the last insert or search

    def random_level(self):
        """Like a skip list: layer l is reached with chance m ** -l."""
        return int(-math.log(1.0 - random.random()) / math.log(self.m))

    def dist(self, q, i):
        self.distances += 1
        return dist2(q, self.points[i])

    def search_layer(self, q, entry_points, ef, layer):
        """Best-first search of one layer. Returns the ef nearest found, nearest first."""
        visited = {i for _, i in entry_points}
        candidates = list(entry_points)  # min-heap: nearest on top
        heapq.heapify(candidates)
        found = [(-d, -i) for d, i in entry_points]  # max-heap: farthest on top
        heapq.heapify(found)
        while candidates:
            c = heapq.heappop(candidates)
            if c > (-found[0][0], -found[0][1]):
                break  # farther than everything kept: nothing left to gain
            for e in self.links[c[1]][layer]:
                if e in visited:
                    continue
                visited.add(e)
                d = self.dist(q, e)
                if len(found) < ef or (d, e) < (-found[0][0], -found[0][1]):
                    heapq.heappush(candidates, (d, e))
                    heapq.heappush(found, (-d, -e))
                    if len(found) > ef:
                        heapq.heappop(found)
        return sorted((-d, -i) for d, i in found)

    def insert(self, q, level=None):
        """Add point q; returns its id."""
        if level is None:
            level = self.random_level()
        new = len(self.points)
        self.points.append(q)
        self.links.append([[] for _ in range(level + 1)])
        self.distances = 0
        if self.entry is None:
            self.entry = new
            return new
        top = len(self.links[self.entry]) - 1
        eps = [(self.dist(q, self.entry), self.entry)]
        for layer in range(top, level, -1):  # greedy: ef = 1
            eps = self.search_layer(q, eps, 1, layer)[:1]
        for layer in range(min(top, level), -1, -1):
            found = self.search_layer(q, eps, self.ef_construction, layer)
            neighbours = [i for _, i in found[: self.m]]
            self.links[new][layer] = neighbours
            limit = 2 * self.m if layer == 0 else self.m
            for e in neighbours:
                self.links[e][layer].append(new)
                if len(self.links[e][layer]) > limit:  # keep the nearest
                    p = self.points[e]
                    ranked = sorted(self.links[e][layer], key=lambda j: (dist2(p, self.points[j]), j))
                    self.links[e][layer] = ranked[:limit]
            eps = found
        if level > top:
            self.entry = new
        return new

    def search(self, q, k, ef):
        """The k nearest ids found (approximate)."""
        self.distances = 0
        top = len(self.links[self.entry]) - 1
        eps = [(self.dist(q, self.entry), self.entry)]
        for layer in range(top, 0, -1):
            eps = self.search_layer(q, eps, 1, layer)[:1]
        return [i for _, i in self.search_layer(q, eps, ef, 0)[:k]]

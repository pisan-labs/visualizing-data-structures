from bisect import bisect_left, insort

RING = 360
NAMES = "ABCDEFGH"


def key_pos(k):
    return (71 * k + 5) % 1009 % RING


def node_pos(server, r):
    token = 100 * (NAMES.index(server) + 1) + r
    return (113 * token + 17) % 1009 % RING


class HashRing:
    """Consistent hashing: a key belongs to the first server node clockwise from h(k)."""

    def __init__(self, vnodes):
        self.v = vnodes
        self.nodes = []  # (position, label, server), sorted clockwise

    def label(self, server, r):
        return server if self.v == 1 else f"{server}{r + 1}"

    def add_server(self, server):
        for r in range(self.v):
            insort(self.nodes, (node_pos(server, r), self.label(server, r), server))

    def remove_server(self, server):
        self.nodes = [n for n in self.nodes if n[2] != server]

    def lookup(self, k):
        """The server that holds k, or None when there are no servers."""
        if not self.nodes:
            return None
        i = bisect_left(self.nodes, (key_pos(k),))
        return self.nodes[i % len(self.nodes)][2]  # past the last node: wrap to the first

def toy_hash(s):
    """FNV-1a over the characters, folded to 16 bits, as 4 hex digits. A teaching hash:
    real Merkle trees use SHA-256, and 16 bits are far too few to stop forgeries."""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch) & 0xFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format((h >> 16) ^ (h & 0xFFFF), "04x")


class MerkleTree:
    """levels[0] are the leaf hashes, levels[-1] == [root]. A node with no partner moves up."""

    def __init__(self, blocks=()):
        self.blocks = list(blocks)
        self._rebuild()

    def _rebuild(self):
        self.levels = []
        if not self.blocks:
            return
        level = [toy_hash(b) for b in self.blocks]
        self.levels.append(level)
        while len(level) > 1:
            level = [
                toy_hash(level[i] + level[i + 1]) if i + 1 < len(level) else level[i]
                for i in range(0, len(level), 2)
            ]
            self.levels.append(level)

    def root(self):
        return self.levels[-1][0] if self.levels else None

    def update(self, i, data):
        """Rehash only the path from leaf i to the root."""
        if not 0 <= i < len(self.blocks):
            raise IndexError("no such block")
        self.blocks[i] = data
        self.levels[0][i] = toy_hash(data)
        for k in range(1, len(self.levels)):
            i //= 2
            below = self.levels[k - 1]
            a = below[2 * i]
            self.levels[k][i] = toy_hash(a + below[2 * i + 1]) if 2 * i + 1 < len(below) else a

    def append(self, data):
        self.blocks.append(data)
        self._rebuild()  # simple; only the right edge really changes

    def proof(self, i):
        """The sibling hashes from leaf i up, as (side, hash); side says where the sibling is."""
        if not 0 <= i < len(self.blocks):
            raise IndexError("no such block")
        out = []
        for level in self.levels[:-1]:
            sib = i ^ 1
            if sib < len(level):
                out.append(("L" if sib < i else "R", level[sib]))
            i //= 2
        return out


def verify(data, proof, root):
    h = toy_hash(data)
    for side, s in proof:
        h = toy_hash(s + h) if side == "L" else toy_hash(h + s)
    return h == root

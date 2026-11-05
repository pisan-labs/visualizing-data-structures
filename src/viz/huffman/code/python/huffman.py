import heapq


class Node:
    def __init__(self, weight, symbol=None, left=None, right=None):
        self.weight = weight
        self.symbol = symbol  # None for a node made by a merge
        self.left = left
        self.right = right


def build(counts):
    """The Huffman tree for {symbol: count}.

    Ties: the tree that joined the queue first comes out first. The leaves join in symbol
    order, before any merged tree, so equal weights take leaves first, then the oldest tree.
    """
    queue = []  # (weight, order joined, node): a min-heap
    order = 0
    for s in sorted(counts):
        heapq.heappush(queue, (counts[s], order, Node(counts[s], s)))
        order += 1
    while len(queue) > 1:
        wx, _, x = heapq.heappop(queue)
        wy, _, y = heapq.heappop(queue)
        heapq.heappush(queue, (wx + wy, order, Node(wx + wy, left=x, right=y)))
        order += 1
    return queue[0][2]


def codes(root):
    """The code of each symbol: a 0 for each left edge, a 1 for each right edge."""
    if root.symbol is not None:
        return {root.symbol: "0"}  # a lone symbol still needs one bit
    table = {}

    def walk(x, code):
        if x.symbol is not None:
            table[x.symbol] = code
        else:
            walk(x.left, code + "0")
            walk(x.right, code + "1")

    walk(root, "")
    return table


def encode(text, table):
    return "".join(table[s] for s in text)


def decode(bits, root):
    """The text, or None if the bits are not a message in this code."""
    if root.symbol is not None:
        return root.symbol * len(bits) if set(bits) <= {"0"} else None
    out = []
    x = root
    for b in bits:
        x = x.left if b == "0" else x.right
        if x.symbol is not None:
            out.append(x.symbol)
            x = root
    return "".join(out) if x is root else None

class Node:
    def __init__(self, uid, tokens, parent):
        self.uid = uid
        self.tokens = tokens  # the run of tokens on the edge into this node
        self.parent = parent
        self.children = []  # in the order they were added
        self.ref = 0  # running requests whose path passes through here
        self.last = 0  # when a request last used it


class RadixCache:
    """A prefix cache: a radix tree of token runs, each with its keys and values."""

    def __init__(self, capacity):
        self.capacity = capacity  # tokens it can hold
        self.root = Node(0, [], None)
        self.uids = 1
        self.size = 0  # tokens it holds
        self.clock = 0

    def child(self, node, token):
        for c in node.children:
            if c.tokens[0] == token:
                return c
        return None

    def split(self, node, k):
        """Cut node's edge after k tokens: a new node takes the first k."""
        top = Node(self.uids, node.tokens[:k], node.parent)
        self.uids += 1
        top.ref, top.last = node.ref, node.last
        siblings = node.parent.children
        siblings[siblings.index(node)] = top
        top.children = [node]
        node.tokens, node.parent = node.tokens[k:], top
        return top

    def match(self, tokens):
        """The deepest node the prompt reaches, and how many tokens matched."""
        node, i = self.root, 0
        while i < len(tokens):
            c = self.child(node, tokens[i])
            if c is None:
                break
            k = 0
            while k < len(c.tokens) and i + k < len(tokens) and c.tokens[k] == tokens[i + k]:
                k += 1
            if k < len(c.tokens):
                c = self.split(c, k)  # the prompt leaves this edge partway
            node, i = c, i + k
        return node, i

    def path(self, node):
        while node is not self.root:
            yield node
            node = node.parent

    def nodes(self):
        stack = [self.root]
        while stack:
            node = stack.pop()
            yield node
            stack.extend(node.children)

    def evictable(self):
        return sum(len(n.tokens) for n in self.nodes() if n.ref == 0)

    def evict(self):
        """Drop the least recently used leaf that no running request uses."""
        leaves = [n for n in self.nodes() if n is not self.root and not n.children and n.ref == 0]
        leaf = min(leaves, key=lambda n: (n.last, n.uid))
        leaf.parent.children.remove(leaf)
        self.size -= len(leaf.tokens)
        return len(leaf.tokens)

    def request(self, tokens):
        """Reuse the longest cached prefix and cache the rest.

        Returns (its last node, tokens matched, tokens evicted), or None if it must wait.
        """
        node, matched = self.match(tokens)
        for n in self.path(node):
            n.ref += 1
        rest = tokens[matched:]
        if len(rest) > self.capacity - self.size + self.evictable():
            for n in self.path(node):
                n.ref -= 1
            return None  # the rest is in use: wait for a request to finish
        self.clock += 1
        for n in self.path(node):
            n.last = self.clock
        evicted = 0
        while self.capacity - self.size < len(rest):
            evicted += self.evict()
        if rest:  # prefill the rest, and keep its keys and values
            leaf = Node(self.uids, rest, node)
            self.uids += 1
            leaf.ref, leaf.last = 1, self.clock
            node.children.append(leaf)
            self.size += len(rest)
            node = leaf
        return node, matched, evicted

    def finish(self, node):
        """The request is done; its tokens stay cached."""
        self.clock += 1
        for n in self.path(node):
            n.ref -= 1
            n.last = self.clock

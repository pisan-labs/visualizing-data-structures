class BlockManager:
    """A paged KV cache: a pool of fixed-size blocks, a free list, and a block table
    per request that maps its logical blocks to physical ones. Only how full each
    block is matters here; a real cache stores a key and a value per slot."""

    def __init__(self, num_blocks, block_size, max_len, sharing=True):
        self.block_size = block_size
        self.max_len = max_len
        self.sharing = sharing
        self.free = list(range(num_blocks - 1, -1, -1))  # a stack: free[-1] is the top
        self.ref = [0] * num_blocks     # how many block tables point at each block
        self.filled = [0] * num_blocks  # tokens in each block
        self.tables = {}                # request -> physical blocks, in logical order
        self.lengths = {}
        self.copies = 0

    def _pop(self):
        p = self.free.pop()
        self.ref[p] = 1
        self.filled[p] = 0
        return p

    def add(self, name, n):
        """A request with a prompt of n tokens: one block per block_size tokens."""
        table = []
        for start in range(0, n, self.block_size):
            p = self._pop()
            self.filled[p] = min(self.block_size, n - start)
            table.append(p)
        self.tables[name] = table
        self.lengths[name] = n

    def append_token(self, name):
        """Write one more token. Returns False if no block is free and it must wait."""
        table = self.tables[name]
        last = table[-1]
        if self.filled[last] == self.block_size:  # full: take a new block
            if not self.free:
                return False
            table.append(self._pop())
        elif self.ref[last] > 1:  # shared: copy on write
            if not self.free:
                return False
            p = self._pop()
            self.filled[p] = self.filled[last]  # copy its keys and values
            self.ref[last] -= 1
            table[-1] = p
            self.copies += 1
        self.filled[table[-1]] += 1
        self.lengths[name] += 1
        return True

    def step(self):
        """One token for every running request, oldest first."""
        for name in self.tables:
            if self.lengths[name] < self.max_len:
                self.append_token(name)

    def finish(self, name):
        """Lower each block's count; a block no one uses goes back on the free list."""
        for p in reversed(self.tables.pop(name)):  # last first: the first ends on top
            self.ref[p] -= 1
            if self.ref[p] == 0:
                self.free.append(p)
        del self.lengths[name]

    def fork(self, parent, child):
        """Parallel sampling: a second answer to the same prompt."""
        if self.sharing:
            table = list(self.tables[parent])  # the same blocks
            for p in table:
                self.ref[p] += 1
        else:
            table = []
            for p in self.tables[parent]:  # a copy of every block
                q = self._pop()
                self.filled[q] = self.filled[p]
                table.append(q)
                self.copies += 1
        self.tables[child] = table
        self.lengths[child] = self.lengths[parent]

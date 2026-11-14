class TwoStackQueue:
    """A first-in, first-out queue made of two stacks: O(1) amortized per operation."""

    def __init__(self):
        self.in_stack = []  # new values go on top
        self.out_stack = []  # the front of the queue is on top

    def enqueue(self, x):
        self.in_stack.append(x)

    def dequeue(self):
        self._refill()
        return self.out_stack.pop()  # IndexError if the queue is empty

    def peek(self):
        self._refill()
        return self.out_stack[-1]

    def _refill(self):
        # Only when out is empty: move everything across, which reverses the order.
        if not self.out_stack:
            while self.in_stack:
                self.out_stack.append(self.in_stack.pop())

    def __len__(self):
        return len(self.in_stack) + len(self.out_stack)

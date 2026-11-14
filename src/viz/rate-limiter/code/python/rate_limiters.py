from collections import deque


class FixedWindow:
    """At most limit requests in each window [k * window, (k + 1) * window)."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.start = 0
        self.count = 0

    def allow(self, t):
        if t >= self.start + self.window:
            self.start = t // self.window * self.window
            self.count = 0
        if self.count < self.limit:
            self.count += 1
            return True
        return False


class SlidingLog:
    """The times of the requests let through in the last window seconds, oldest first."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.log = deque()

    def allow(self, t):
        while self.log and self.log[0] <= t - self.window:
            self.log.popleft()
        if len(self.log) < self.limit:
            self.log.append(t)
            return True
        return False


class SlidingWindowCounter:
    """This window's count and the previous one's. The last window seconds hold about
    curr + prev * (window - (t - start)) / window requests."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.start = 0
        self.prev = self.curr = 0

    def allow(self, t):
        w = t // self.window * self.window
        if w == self.start + self.window:
            self.prev, self.curr = self.curr, 0
        elif w > self.start + self.window:
            self.prev, self.curr = 0, 0
        self.start = w
        overlap = self.window - (t - self.start)
        # estimate < limit, times window, so the arithmetic stays in whole numbers
        if self.curr * self.window + self.prev * overlap < self.limit * self.window:
            self.curr += 1
            return True
        return False


class TokenBucket:
    """At most limit tokens, and limit more every window seconds. Tokens are kept in
    units of 1 / window (a token is window units), so the arithmetic is exact."""

    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.units = limit * window  # starts full
        self.last = 0

    def allow(self, t):
        full = self.limit * self.window
        self.units = min(full, self.units + (t - self.last) * self.limit)
        self.last = t
        if self.units >= self.window:
            self.units -= self.window
            return True
        return False

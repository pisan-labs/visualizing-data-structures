import heapq


class RunningMedian:
    """The median of the values added so far: add is O(log n), median is O(1)."""

    def __init__(self):
        self.low = []  # the smaller half, a max-heap (heapq is a min-heap, so values are negated)
        self.high = []  # the larger half, a min-heap

    def add(self, x):
        if not self.low or x <= -self.low[0]:
            heapq.heappush(self.low, -x)
        else:
            heapq.heappush(self.high, x)
        # Rebalance, so low holds as many as high or one more.
        if len(self.low) > len(self.high) + 1:
            heapq.heappush(self.high, -heapq.heappop(self.low))
        elif len(self.high) > len(self.low):
            heapq.heappush(self.low, -heapq.heappop(self.high))

    def median(self):
        """The middle value, or the mean of the two middle values for an even count."""
        if len(self.low) > len(self.high):
            return -self.low[0]
        return (-self.low[0] + self.high[0]) / 2

    def lower_median(self):
        """The middle value, or the lower of the two middle values."""
        return -self.low[0]

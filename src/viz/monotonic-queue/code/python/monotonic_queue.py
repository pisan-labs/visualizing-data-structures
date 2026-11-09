from collections import deque


def window_max(a, k):
    """The maximum of every window of k consecutive values."""
    out = []
    d = deque()  # indices; their values decrease from front to back
    for i, v in enumerate(a):
        if d and d[0] == i - k:
            d.popleft()  # it left the window
        while d and a[d[-1]] <= v:
            d.pop()  # older and no bigger: it can never win again
        d.append(i)
        if i >= k - 1:
            out.append(a[d[0]])
    return out


def window_min(a, k):
    """The minimum of every window of k consecutive values."""
    out = []
    d = deque()  # indices; their values increase from front to back
    for i, v in enumerate(a):
        if d and d[0] == i - k:
            d.popleft()
        while d and a[d[-1]] >= v:
            d.pop()
        d.append(i)
        if i >= k - 1:
            out.append(a[d[0]])
    return out

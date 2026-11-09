def next_greater(a):
    """For each value, the first bigger value to its right, or -1."""
    ans = [-1] * len(a)
    stack = []  # indices; their values decrease from bottom to top
    for i, v in enumerate(a):
        while stack and a[stack[-1]] < v:
            ans[stack.pop()] = v
        stack.append(i)
    return ans


def previous_smaller(a):
    """For each value, the nearest smaller value to its left, or -1."""
    ans = [-1] * len(a)
    stack = []  # indices; their values increase from bottom to top
    for i, v in enumerate(a):
        while stack and a[stack[-1]] >= v:
            stack.pop()
        if stack:
            ans[i] = a[stack[-1]]
        stack.append(i)
    return ans


def largest_rectangle(h):
    """The largest rectangle under bars of heights h, each 1 wide."""
    best = 0
    stack = []  # indices; their heights increase from bottom to top
    for i in range(len(h) + 1):
        height = h[i] if i < len(h) else 0
        while stack and h[stack[-1]] >= height:
            j = stack.pop()
            left = stack[-1] + 1 if stack else 0
            best = max(best, h[j] * (i - left))
        stack.append(i)
    return best

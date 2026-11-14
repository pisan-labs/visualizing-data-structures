def count_sum_k(a, k):
    """How many subarrays (non-empty, contiguous) of a sum to k. One pass, O(n)."""
    seen = {0: 1}  # running sum -> how many times it has appeared; the empty prefix is 0
    total = count = 0
    for x in a:
        total += x
        count += seen.get(total - k, 0)  # each earlier total - k starts one that ends here
        seen[total] = seen.get(total, 0) + 1
    return count


def longest_sum_k(a, k):
    """Length and start of the longest subarray with sum k, or (0, -1) if there is none."""
    first = {0: 0}  # running sum -> after how many values it first appeared
    total = 0
    best, start = 0, -1
    for j, x in enumerate(a, 1):
        total += x
        i = first.get(total - k)
        if i is not None and j - i > best:
            best, start = j - i, i  # a[i:j] sums to k
        first.setdefault(total, j)  # keep the first: an earlier start is longer
    return best, start

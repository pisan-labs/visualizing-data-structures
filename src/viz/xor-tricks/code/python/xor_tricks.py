def single(nums):
    """The one value without a pair: pairs cancel, since x ^ x = 0. O(1) extra space."""
    acc = 0
    for x in nums:
        acc ^= x
    return acc


def missing(nums):
    """The number missing from 0..n, given n different values from 0..n."""
    acc = len(nums)  # n is the one number that is not an index
    for i, x in enumerate(nums):
        acc ^= i ^ x
    return acc


def two_singles(nums):
    """The two values without a pair, smaller first."""
    x = 0
    for v in nums:
        x ^= v  # ends as a ^ b, not 0 since a != b
    low = x & -x  # the lowest bit where a and b differ
    a = b = 0
    for v in nums:
        if v & low:
            a ^= v
        else:
            b ^= v
    return min(a, b), max(a, b)


def swap(values, i, j):
    """Swap values[i] and values[j] without a temporary."""
    if i != j:  # values[i] ^= values[i] would make it 0
        values[i] ^= values[j]
        values[j] ^= values[i]
        values[i] ^= values[j]

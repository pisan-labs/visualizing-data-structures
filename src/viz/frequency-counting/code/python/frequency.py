from collections import defaultdict


def counts(word):
    """The 26 letter counts of a lowercase word."""
    count = [0] * 26
    for ch in word:
        count[ord(ch) - ord("a")] += 1
    return count


def group_anagrams(words):
    """Lists of the words that are anagrams of each other, in the order each group starts."""
    groups = defaultdict(list)  # key: all 26 counts; a dict keeps insertion order
    for w in words:
        groups[tuple(counts(w))].append(w)
    return list(groups.values())


def first_unique(s):
    """The index of the first letter of s that appears only once, or -1. Two passes, O(n)."""
    count = counts(s)
    for i, ch in enumerate(s):
        if count[ord(ch) - ord("a")] == 1:
            return i
    return -1

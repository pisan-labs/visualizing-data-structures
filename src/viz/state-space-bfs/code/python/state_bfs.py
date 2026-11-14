from collections import deque


def fewest_moves(start, goal, moves, allowed):
    """BFS over states made on the fly: the fewest moves from start to goal, or -1."""
    if start == goal:
        return 0
    dist = {start: 0}  # the visited set, with each state's distance
    queue = deque([start])
    while queue:
        s = queue.popleft()
        for t in moves(s):  # the graph is never stored: make the neighbours now
            if not allowed(t) or t in dist:
                continue
            if t == goal:
                return dist[s] + 1
            dist[t] = dist[s] + 1
            queue.append(t)
    return -1


def turns(state):
    """Turn each wheel up, then down; 9 wraps round to 0."""
    for i, c in enumerate(state):
        for step in (1, -1):
            yield state[:i] + str((int(c) + step) % 10) + state[i + 1 :]


def letter_changes(word):
    """Change one letter at a time, a to z."""
    for i, c in enumerate(word):
        for ch in "abcdefghijklmnopqrstuvwxyz":
            if ch != c:
                yield word[:i] + ch + word[i + 1 :]


def lock_moves(barred, goal):
    """Fewest turns from all zeros to goal, never showing a barred combination."""
    barred = set(barred)
    return fewest_moves("0" * len(goal), goal, turns, lambda t: t not in barred)


def word_moves(words, goal):
    """Fewest one-letter changes from words[0] to goal, every step a word in the list."""
    known = set(words)
    return fewest_moves(words[0], goal, letter_changes, lambda t: t in known)

# Test driver: "load v1 v2 ..." replaces the list and drops queued updates; "add l r x" queues
# an update; "apply" applies the queued updates, prints the list, and empties the queue.
import sys

from difference_array import apply_updates


def main():
    a, queued = [], []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a, queued = [int(x) for x in parts[1:]], []
        elif cmd == "add":
            queued.append(tuple(int(x) for x in parts[1:4]))
        elif cmd == "apply":
            a, queued = apply_updates(a, queued), []
            print(*a)


main()

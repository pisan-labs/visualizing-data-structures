# Test driver: "ship d w1 w2 ..." prints the smallest capacity that ships the weights in d
# days; "spread k p1 p2 ..." prints the largest gap k items can keep on the positions.
import sys

from search_answer import largest_gap, smallest_capacity


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 3:
            continue
        cmd, n, values = parts[0], int(parts[1]), [int(x) for x in parts[2:]]
        if cmd == "ship":
            print(smallest_capacity(values, n))
        elif cmd == "spread":
            print(largest_gap(values, n))


main()

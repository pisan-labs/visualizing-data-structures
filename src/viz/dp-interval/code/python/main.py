# Test driver: "best v1 v2 ..." prints the best total for taking the tiles; "order v1 ..."
# prints it and the order (positions from 1); "cost s1 s2 ..." prints the least cost to merge
# the piles; "tree s1 ..." prints it and the merges as brackets.
import sys

from intervals import best_removal, cheapest_merge


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        cmd, xs = parts[0], [int(x) for x in parts[1:]]
        if cmd in ("best", "order"):
            best, order = best_removal(xs)
            print(best) if cmd == "best" else print(best, *order)
        else:
            cost, tree = cheapest_merge(xs)
            print(cost) if cmd == "cost" else print(cost, tree)


main()

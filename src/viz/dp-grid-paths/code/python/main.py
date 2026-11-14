# Test driver: "count g" prints how many paths cross the grid g (rows split by /, a digit per
# cell, # for a wall); "cost g" prints the cheapest path's cost; "path g" prints the cost and
# the moves (D, R). Both print "none" when walls block every path.
import sys

from grid_paths import cheapest_path, count_paths


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 2:
            continue
        cmd, grid = parts[0], parts[1].split("/")
        if cmd == "count":
            print(count_paths(grid))
        else:
            best = cheapest_path(grid)
            if best is None:
                print("none")
            elif cmd == "cost":
                print(best[0])
            else:
                print(best[0], *best[1])


main()

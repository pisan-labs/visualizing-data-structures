# Test driver: "value W w1:v1 w2:v2 ..." prints the best value for capacity W; "pack W w1:v1 ..."
# prints the best value and the numbers of the items taken.
import sys

from knapsack import knapsack


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        capacity = int(parts[1])
        items = [tuple(map(int, p.split(":"))) for p in parts[2:]]
        value, taken = knapsack(items, capacity)
        if parts[0] == "value":
            print(value)
        elif parts[0] == "pack":
            print(" ".join(map(str, [value] + taken)))


main()

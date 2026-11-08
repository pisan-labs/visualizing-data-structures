# Test driver: "best W w1:v1 w2:v2 ..." prints the most value that fits in capacity W when items
# can be cut, as a whole number or a fraction in lowest terms, such as 68/3.
import sys

from fractional import fractional_knapsack


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 3 or parts[0] != "best":
            continue
        items = [tuple(map(int, p.split(":"))) for p in parts[2:]]
        print(fractional_knapsack(items, int(parts[1])))


main()

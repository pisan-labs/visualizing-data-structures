# Test driver: reads "shuffle x1 ... xn | j1 j2 ...", one per line: the values, then the random
# picks to use in order. Prints the shuffled values.
import sys

from shuffle import shuffle


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "shuffle":
            continue
        bar = parts.index("|")
        values = parts[1:bar]
        picks = iter(int(p) for p in parts[bar + 1 :])

        def randint(lo, hi):
            j = next(picks)
            assert lo <= j <= hi
            return j

        shuffle(values, randint)
        print(*values)


main()

# Test driver: reads "sample k x1 ... xn | j(k+1) ... jn", one per line: the reservoir size, the
# stream, then the random draws for the items after the first k. Prints the reservoir.
import sys

from reservoir import reservoir_sample


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "sample":
            continue
        k = int(parts[1])
        bar = parts.index("|")
        stream = parts[2:bar]
        draws = iter(int(p) for p in parts[bar + 1 :])

        def randint(lo, hi):
            j = next(draws)
            assert lo <= j <= hi
            return j

        print(*reservoir_sample(stream, k, randint))


main()

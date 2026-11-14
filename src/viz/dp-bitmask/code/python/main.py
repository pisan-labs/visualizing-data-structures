# Test driver: "solve c00 c01 ... / c10 c11 ... / ..." reads a cost table row by row (one row
# per worker) and prints the least total, then the task of each worker.
import sys

from assignment import cheapest


def main():
    for line in sys.stdin:
        parts = line.split(maxsplit=1)
        if len(parts) == 2 and parts[0] == "solve":
            cost = [[int(x) for x in row.split()] for row in parts[1].split("/")]
            total, tasks = cheapest(cost)
            print(total, *tasks)


main()

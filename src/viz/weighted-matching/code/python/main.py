# Test driver: reads one operation per line, prints one result per line.
# "solve <min|max> <n> <n*n costs, row by row>" prints "<total> | <column of each row>".
import sys

from hungarian import best_assignment


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "solve":
            continue
        n = int(parts[2])
        values = [int(x) for x in parts[3:]]
        cost = [values[i * n:(i + 1) * n] for i in range(n)]
        total, mate = best_assignment(cost, parts[1] == "max")
        print(f"{total} | {' '.join(str(j + 1) for j in mate)}")


main()

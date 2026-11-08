# Test driver: reads one operation per line, prints one result per line.
#   machine anbncn | power2 | double   which machine runs
#   run aabbcc                         prints "accept 23", "reject 4" or "blocked 3"
import sys

from lba import ANBNCN, DOUBLE, POWER2, run

MACHINES = {"anbncn": (ANBNCN, "q0"), "power2": (POWER2, "q1"), "double": (DOUBLE, "q0")}


def main():
    rules, start = MACHINES["anbncn"]
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "machine":
            rules, start = MACHINES[arg]
        elif op == "run":
            print(*run(rules, start, "" if arg == "eps" else arg))


main()

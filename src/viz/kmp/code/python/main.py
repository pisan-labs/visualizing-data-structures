# Test driver: each line "search T P" prints the shifts where P occurs
# in T, separated by spaces, or "none".
import sys

from kmp import kmp_search


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) == 3 and parts[0] == "search":
            found = kmp_search(parts[1], parts[2])
            print(" ".join(map(str, found)) if found else "none")


main()

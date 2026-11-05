# Test driver: each line "search T P" prints the shifts where P occurs
# in T, separated by spaces, or "none".
import sys

from rabin_karp import rabin_karp


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) == 3 and parts[0] == "search":
            found = rabin_karp(parts[1], parts[2])
            print(" ".join(map(str, found)) if found else "none")


main()

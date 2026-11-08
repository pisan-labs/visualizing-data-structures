# Test driver: "zarray S" prints z[0..n-1]; "search T P" prints the
# shifts where P occurs in T, or "none".
import sys

from z_algorithm import z_array, z_search


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) == 2 and parts[0] == "zarray":
            print(" ".join(map(str, z_array(parts[1]))))
        elif len(parts) == 3 and parts[0] == "search":
            found = z_search(parts[1], parts[2])
            print(" ".join(map(str, found)) if found else "none")


main()

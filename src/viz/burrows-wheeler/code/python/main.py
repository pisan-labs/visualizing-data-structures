# Test driver: "bwt T" prints the transform of T + "$"; "inverse L" prints
# the text back. "bwtindex T" prints "L index"; "inverseindex L index"
# prints the text, for the version with no end marker.
import sys

from bwt import bwt, bwt_index, inverse_bwt, inverse_bwt_index


def main():
    for line in sys.stdin:
        parts = line.split()
        if parts[0] == "bwt":
            print(bwt(parts[1]))
        elif parts[0] == "inverse":
            print(inverse_bwt(parts[1]))
        elif parts[0] == "bwtindex":
            last, index = bwt_index(parts[1])
            print(last, index)
        elif parts[0] == "inverseindex":
            print(inverse_bwt_index(parts[1], int(parts[2])))


main()

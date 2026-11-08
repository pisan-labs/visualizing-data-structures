# Test driver: "radii S" prints p for S with separators; "longest S"
# prints the longest palindromic substring of S.
import sys

from manacher import longest_palindrome, radii


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) == 2 and parts[0] == "radii":
            print(" ".join(map(str, radii(parts[1]))))
        elif len(parts) == 2 and parts[0] == "longest":
            print(longest_palindrome(parts[1]))


main()

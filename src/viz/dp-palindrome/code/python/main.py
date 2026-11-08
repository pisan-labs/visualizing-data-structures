# Test driver: "length s" prints the length of the longest palindromic subsequence of s;
# "palindrome s" prints the length and one such palindrome.
import sys

from palindrome import longest_palindrome, lps_table


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 2:
            continue
        s = parts[1]
        if parts[0] == "length":
            print(lps_table(s)[0][len(s) - 1])
        elif parts[0] == "palindrome":
            p = longest_palindrome(s)
            print(len(p), p)


main()

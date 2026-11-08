# Test driver: reads "pow a b m", one per line, prints a^b mod m.
import sys

from mod_pow import mod_pow


def main():
    for line in sys.stdin:
        parts = line.split()
        if parts and parts[0] == "pow":
            a, b, m = (int(p) for p in parts[1:4])
            print(mod_pow(a, b, m))


main()

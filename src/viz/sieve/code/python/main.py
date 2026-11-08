# Test driver: reads "sieve n", one per line, prints the primes up to n.
import sys

from sieve import sieve


def main():
    for line in sys.stdin:
        parts = line.split()
        if parts and parts[0] == "sieve":
            print(*sieve(int(parts[1])))


main()

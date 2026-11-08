# Test driver: reads "multiply x y", one per line, prints the product and the number of calls.
import sys

import karatsuba


def main():
    for line in sys.stdin:
        parts = line.split()
        if parts and parts[0] == "multiply":
            karatsuba.calls = 0
            product = karatsuba.karatsuba(int(parts[1]), int(parts[2]))
            print(product, karatsuba.calls)


main()

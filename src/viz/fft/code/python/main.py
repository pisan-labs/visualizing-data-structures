# Test driver, one operation per line:
#   "fft a0 a1 ..." prints each output's real and imaginary parts in hundredths, rounded;
#   "multiply a0 a1 ... | b0 b1 ..." prints the product's coefficients.
import math
import sys

from fft import fft, multiply


def hundredths(x):
    return math.floor(x * 100 + 0.5)


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "fft":
            y = fft([complex(int(v)) for v in parts[1:]])
            print(*[f"{hundredths(z.real)} {hundredths(z.imag)}" for z in y])
        elif parts[0] == "multiply":
            bar = parts.index("|")
            a = [int(v) for v in parts[1:bar]]
            b = [int(v) for v in parts[bar + 1 :]]
            print(*multiply(a, b))


main()

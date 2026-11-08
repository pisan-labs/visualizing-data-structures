# Test driver: reads "keys p q" and "use-e e" (print "n e d"), "encrypt m" and "decrypt c"
# (print the result), one per line.
import sys

from rsa import decrypt, encrypt, make_keys


def main():
    p = q = n = e = d = 0
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, x = parts[0], [int(v) for v in parts[1:]]
        if op == "keys":
            p, q = x
            n, e, d = make_keys(p, q)
            print(n, e, d)
        elif op == "use-e":
            n, e, d = make_keys(p, q, x[0])
            print(n, e, d)
        elif op == "encrypt":
            print(encrypt(x[0], e, n))
        elif op == "decrypt":
            print(decrypt(x[0], d, n))


main()

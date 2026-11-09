# Test driver: "init b p" sets the base and modulus; "load s" hashes the prefixes of s;
# "prefix" prints h[0..n]; "hash l r" prints the hash of s[l..r]; "compare i j len" prints
# equal, different or collision; "windows k" prints the hash of every window of k.
import sys

from string_hash import PrefixHash, window_hashes


def main():
    b = p = 0
    s, ph = "", None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd, args = parts[0], parts[1:]
        if cmd == "init":
            b, p = int(args[0]), int(args[1])
        elif cmd == "load":
            s = args[0]
            ph = PrefixHash(s, b, p)
        elif cmd == "prefix":
            print(*ph.h)
        elif cmd == "hash":
            print(ph.get(int(args[0]), int(args[1])))
        elif cmd == "compare":
            i, j, n = map(int, args)
            if ph.get(i, i + n - 1) != ph.get(j, j + n - 1):
                print("different")
            else:
                print("equal" if s[i : i + n] == s[j : j + n] else "collision")
        elif cmd == "windows":
            print(*window_hashes(s, int(args[0]), b, p))


main()

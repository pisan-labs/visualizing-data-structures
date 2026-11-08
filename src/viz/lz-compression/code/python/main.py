# Test driver, one line each:
#   lz77 W A text       prints the triples as (offset,length,next)
#   unlz77 triples...   prints the text
#   lzw text            prints the codes
#   unlzw codes...      prints the text
import sys

from lz import lz77, lzw, unlz77, unlzw


def main():
    for line in sys.stdin:
        parts = line.split()
        op = parts[0]
        if op == "lz77":
            triples = lz77(parts[3], int(parts[1]), int(parts[2]))
            print(" ".join(f"({o},{n},{c})" for o, n, c in triples))
        elif op == "unlz77":
            triples = []
            for t in parts[1:]:
                o, n, c = t.strip("()").split(",")
                triples.append((int(o), int(n), c))
            print(unlz77(triples))
        elif op == "lzw":
            print(" ".join(map(str, lzw(parts[1]))))
        elif op == "unlzw":
            print(unlzw([int(c) for c in parts[1:]]))


main()

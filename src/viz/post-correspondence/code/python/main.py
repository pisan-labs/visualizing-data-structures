# Test driver: reads one operation per line, prints one result per line.
#   dominoes b/ca a/ab ...   loads an instance (prints nothing)
#   search <bound>           prints "match 2 1 3 2 4", "no match", "none up to 6" or "gave up"
#   try 2 1 3                prints "match", "dead at column 4" or "alive top +ca"
import sys

from pcp import search, try_sequence


def main():
    dominoes = []
    for line in sys.stdin:
        op, *args = line.split()
        if op == "dominoes":
            dominoes = [tuple(d.split("/")) for d in args]
        elif op == "search":
            result = search(dominoes, int(args[0]))
            if isinstance(result, list):
                print("match", *result)
            else:
                print(result)
        elif op == "try":
            print(try_sequence(dominoes, [int(a) for a in args]))


main()

# Test driver: reads one operation per line, prints one line per result.
# "random i" makes the random pick return index i, so the output can be checked.
import sys

from randomized_set import RandomizedSet


def main():
    picks = []
    s = RandomizedSet(pick=lambda n: picks.pop())
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "insert":
            out.append(str(s.insert(int(parts[1]))).lower())
        elif op == "remove":
            out.append(str(s.remove(int(parts[1]))).lower())
        elif op == "random":
            if len(s) == 0:
                out.append("empty")
            else:
                picks.append(int(parts[1]))
                out.append(str(s.get_random()))
    print("\n".join(out))


main()

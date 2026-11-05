# Test driver: reads one operation per line, prints one result per line.
import sys

import growth


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "count":
            f = getattr(growth, parts[1])
            out.append(str(f(int(parts[2]))))
    print("\n".join(out))


main()

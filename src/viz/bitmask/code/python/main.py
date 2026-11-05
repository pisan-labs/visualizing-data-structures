# Test driver: reads one operation per line, prints one result per line.
import sys

from bitmask import (
    clear_bit,
    lowest_bit,
    popcount,
    set_bit,
    submasks,
    subsets,
    test_bit,
    toggle_bit,
)


def main():
    x = 0
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "load":
            x = args[0]
            out.append(str(x))
        elif op in ("set", "clear", "toggle"):
            change = {"set": set_bit, "clear": clear_bit, "toggle": toggle_bit}[op]
            x = change(x, args[0])
            out.append(str(x))
        elif op == "test":
            out.append(str(test_bit(x, args[0])))
        elif op == "lowbit":
            out.append(str(lowest_bit(x)))
        elif op == "popcount":
            out.append(str(popcount(x)))
        elif op == "subsets":
            out.append(" ".join(map(str, subsets(args[0]))))
        elif op == "submasks":
            out.append(" ".join(map(str, submasks(x))))
    print("\n".join(out))


main()

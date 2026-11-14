# Test driver: "load v1 v2 ..." replaces the list; "max" prints "best lo hi" of the maximum
# subarray; "max_or_empty" does the same with the empty subarray allowed ("0 0 -1").
import sys

from kadane import max_subarray


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "max":
            print(*max_subarray(a))
        elif cmd == "max_or_empty":
            print(*max_subarray(a, allow_empty=True))


main()

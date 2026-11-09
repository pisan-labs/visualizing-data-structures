# Test driver: "load v1 v2 ..." replaces the list; "next" prints each value's next greater
# value (-1 for none); "prev" prints each previous smaller value; "histogram" prints the
# largest rectangle.
import sys

from monotonic_stack import largest_rectangle, next_greater, previous_smaller


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "next":
            print(*next_greater(a))
        elif cmd == "prev":
            print(*previous_smaller(a))
        elif cmd == "histogram":
            print(largest_rectangle(a))


main()

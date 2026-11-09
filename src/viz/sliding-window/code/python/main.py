# Test driver: "load v1 v2 ..." replaces the list; "fixed k" prints "best start";
# "atleast S" prints the shortest length (0 for none); "distinct" prints "length start".
import sys

from sliding_window import longest_distinct, max_sum, shortest_at_least


def main():
    a = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd = parts[0]
        if cmd == "load":
            a = [int(x) for x in parts[1:]]
        elif cmd == "fixed":
            print(*max_sum(a, int(parts[1])))
        elif cmd == "atleast":
            print(shortest_at_least(a, int(parts[1])))
        elif cmd == "distinct":
            print(*longest_distinct(a))


main()

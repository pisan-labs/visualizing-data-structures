# Test driver: reads one operation per line, prints one result per line.
import sys

from kd_tree import KdTree


def main():
    tree = KdTree()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, nums = parts[0], [int(t) for t in parts[1:]]
        if op == "insert":
            tree.insert((nums[0], nums[1]))
        elif op == "clear":
            tree = KdTree()
        elif op == "nearest":
            r = tree.nearest((nums[0], nums[1]))
            out.append("empty" if r is None else f"{r[0][0]},{r[0][1]} {r[1]}")
        elif op == "range":
            pts = sorted(tree.range((nums[0], nums[1]), (nums[2], nums[3])))
            out.append(" ".join(f"{x},{y}" for x, y in pts) if pts else "none")
    sys.stdout.write("".join(line + "\n" for line in out))


main()

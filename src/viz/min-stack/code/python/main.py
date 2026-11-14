# Test driver: reads one operation per line, prints one line per result.
import sys

from min_stack import MinStack


def main():
    stack = MinStack()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "push":
            stack.push(int(parts[1]))
        elif len(stack) == 0:
            out.append("empty")
        elif op == "pop":
            out.append(str(stack.pop()))
        elif op == "top":
            out.append(str(stack.top()))
        elif op == "min":
            out.append(str(stack.get_min()))
    print("\n".join(out))


main()

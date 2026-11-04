# Test driver: reads one operation per line, prints one result per line.
import sys

from array_stack import ArrayStack


def main():
    stack = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            stack = ArrayStack(int(args[0]))
        elif op == "push":
            try:
                stack.push(args[0])
                out.append("ok")
            except OverflowError:
                out.append("overflow")
        elif op == "pop":
            try:
                out.append(str(stack.pop()))
            except IndexError:
                out.append("underflow")
        elif op == "peek":
            try:
                out.append(str(stack.peek()))
            except IndexError:
                out.append("empty")
        elif op == "clear":
            stack.clear()
            out.append("ok")
    print("\n".join(out))


main()

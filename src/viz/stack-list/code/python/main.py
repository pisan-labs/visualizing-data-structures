# Test driver: reads one operation per line, prints one result per line.
import sys

from linked_stack import LinkedStack


def main():
    stack = LinkedStack()
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "push":
            stack.push(parts[1])
            out.append("ok")
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
        else:
            raise ValueError("unknown operation " + op)
    print("\n".join(out))


main()

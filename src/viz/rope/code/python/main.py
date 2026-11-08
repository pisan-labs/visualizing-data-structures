# Test driver: reads one operation per line, prints one result per line.
import sys

from rope import Rope, build

MAX_LEN, MAX_PIECE = 40, 12  # the page's limits, so the drawing stays readable


def main():
    leaf = 4
    rope, other = Rope(), None
    out = []
    for line in sys.stdin:
        line = line.rstrip("\n")
        op, _, rest = line.partition(" ")
        args = rest.split()
        if op == "new":
            leaf = int(args[0])
        elif op == "build":
            rope, other = Rope(build(rest, leaf)), None
            out.append(str(len(rope)))
        elif op == "index":
            try:
                out.append('"' + rope.index(int(args[0])) + '"')
            except IndexError:
                out.append("invalid")
        elif op == "append":
            if len(rope) + len(rest) > MAX_LEN or len(rest) > MAX_PIECE:
                out.append("invalid")
            else:
                rope.append(rest)
                out.append(str(len(rope)))
        elif op == "insert":
            text = args[1]
            if other or len(rope) + len(text) > MAX_LEN or len(text) > MAX_PIECE:
                out.append("invalid")
                continue
            try:
                rope.insert(int(args[0]), text)
                out.append(str(len(rope)))
            except IndexError:
                out.append("invalid")
        elif op == "delete":
            try:
                if other:
                    raise IndexError("join first")
                rope.delete(int(args[0]), int(args[1]))
                out.append(str(len(rope)))
            except IndexError:
                out.append("invalid")
        elif op == "split":
            try:
                if other:
                    raise IndexError("join first")
                other = rope.split(int(args[0]))
                out.append(f"{len(rope)} {len(other)}")
            except IndexError:
                out.append("invalid")
        elif op == "join":
            if other is None:
                out.append("none")
            else:
                rope.join(other)
                other = None
                out.append(str(len(rope)))
        elif op == "clear":
            rope, other = Rope(), None
            out.append("ok")
    print("\n".join(out))


main()

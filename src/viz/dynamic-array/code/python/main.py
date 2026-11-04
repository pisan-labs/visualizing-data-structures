# Test driver: reads one operation per line, prints one result per line.
import sys

from dynamic_array import DynamicArray


def index(token):
    try:
        return int(token)
    except ValueError:
        return None


def main():
    array = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "new":
            array = DynamicArray(int(args[0]))
            continue
        if op == "capacity":
            out.append(str(array.capacity()))
            continue
        if op == "append":
            array.append(args[0])
            out.append("ok")
            continue
        if op == "removeLast":
            out.append(str(array.remove_last()) if array.size else "empty")
            continue
        i = index(args[0])
        try:
            if i is None:
                raise IndexError("not an index")
            if op == "insert":
                array.insert(i, args[1])
                out.append("ok")
            elif op == "removeAt":
                out.append(str(array.remove_at(i)))
            elif op == "get":
                out.append(str(array.get(i)))
            elif op == "set":
                array.set(i, args[1])
                out.append("ok")
            else:
                raise ValueError("unknown operation " + op)
        except IndexError:
            out.append("error")
    print("\n".join(out))


main()

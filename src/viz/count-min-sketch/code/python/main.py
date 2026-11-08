# Test driver: reads one operation per line, prints one result per line.
import sys

from count_min_sketch import CountMinSketch


def main():
    cms = None
    seen = []  # items in first-seen order: the candidates for heavy hitters
    n = 0
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], [int(a) for a in parts[1:]]
        if op == "new":
            cms = CountMinSketch(args[0], args[1])
        elif op == "add":
            cms.add(args[0])
            n += 1
            if args[0] not in seen:
                seen.append(args[0])
            out.append(" ".join(str(cms.column(i, args[0])) for i in range(cms.d)))
        elif op == "estimate":
            out.append(str(cms.estimate(args[0])))
        elif op == "heavy":
            hits = [x for x in cms.heavy_hitters(seen, n, 20) if cms.estimate(x) > 0]
            out.append(" ".join(map(str, hits)) if hits else "none")
        elif op == "clear":
            cms = CountMinSketch(cms.d, cms.w)
            seen, n = [], 0
            out.append("ok")
    print("\n".join(out))


main()

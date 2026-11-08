# Test driver: reads one operation per line, prints one result per line.
import sys

from delaunay import bowyer_watson


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts or parts[0] != "delaunay":
            continue
        n = [int(t) for t in parts[1:]]
        tris = bowyer_watson(list(zip(n[0::2], n[1::2])))
        rows = sorted(" ".join(f"{x},{y}" for x, y in sorted(t)) for t in tris)
        out.append(" | ".join(rows) if rows else "none")
    sys.stdout.write("".join(line + "\n" for line in out))


main()

# Test driver: reads one operation per line, prints one result per line.
import sys

from polygon import area2, is_convex, orientation, ray_cast, winding_number


def main():
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, nums = parts[0], [int(t) for t in parts[1:]]
        if op in ("inside", "winding"):
            q, nums = (nums[0], nums[1]), nums[2:]
        poly = list(zip(nums[0::2], nums[1::2]))
        if op == "area":
            s = abs(area2(poly))
            out.append(f"{s // 2}" + (".5" if s % 2 else ""))
        elif op == "orient":
            out.append(orientation(poly))
        elif op == "convex":
            out.append("yes" if is_convex(poly) else "no")
        elif op == "inside":
            out.append(ray_cast(poly, q))
        elif op == "winding":
            out.append(winding_number(poly, q))
    sys.stdout.write("".join(line + "\n" for line in out))


main()

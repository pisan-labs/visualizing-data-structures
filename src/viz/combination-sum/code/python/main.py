# Test driver: "again t v1 v2 ..." (each candidate as often as you like) or "once t v1 v2 ..."
# (each at most once) prints every combination that sums to t, in the order found, such as
# "[3,3,4] [3,7] [5,5]", or "none".
import sys

from combination_sum import combination_sum


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 2:
            continue
        mode, target, values = parts[0], int(parts[1]), [int(x) for x in parts[2:]]
        found = combination_sum(values, target, reuse=(mode == "again"))
        text = " ".join("[" + ",".join(str(x) for x in combo) + "]" for combo in found)
        print(text or "none")


main()

# Test driver: "best c f p1 p2 ..." prints the most money from trading one item at prices
# p1..pn, with a cooldown when c is 1 and a fee f per sale; "plan c f p1 p2 ..." prints it and
# the trades ("7 buy 2 sell 4"), or "0 none" when no trade pays.
import sys

from trading import best_plan


def main():
    for line in sys.stdin:
        parts = line.split()
        if len(parts) < 4:
            continue
        cooldown, fee, prices = parts[1] == "1", int(parts[2]), [int(x) for x in parts[3:]]
        best, plan = best_plan(prices, cooldown, fee)
        if parts[0] == "best":
            print(best)
        elif plan:
            print(best, *(f"{a} {t}" for a, t in plan))
        else:
            print(best, "none")


main()

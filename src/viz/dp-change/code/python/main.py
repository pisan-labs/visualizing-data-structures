# Test driver: "coins c1 c2 ..." sets the coins. "change a" prints the number of coins and the
# coins themselves ("none" if a cannot be made); "ways a" prints the number of ways to make a.
import sys

from change import count_ways, fewest_coins


def main():
    coins = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "coins":
            coins = [int(x) for x in parts[1:]]
        elif parts[0] == "change":
            paid = fewest_coins(coins, int(parts[1]))
            print("none" if paid is None else " ".join(map(str, [len(paid)] + paid)))
        elif parts[0] == "ways":
            print(count_ways(coins, int(parts[1])))


main()

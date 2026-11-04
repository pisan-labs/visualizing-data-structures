# Test driver: "subsets 1 2 3", "target 5 1 2 3 4" or "permutations 1 2 3", one per line.
# Prints the outputs in the order the search finds them, such as "[1,2] [1] [2] []".
import sys

from backtracking import permutations, subsets


def show(lists):
    return " ".join("[" + ",".join(str(v) for v in xs) + "]" for xs in lists)


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, nums = parts[0], [int(x) for x in parts[1:]]
        if op == "subsets":
            print(show(subsets(nums)))
        elif op == "target":
            print(show(subsets(nums[1:], target=nums[0])))
        elif op == "permutations":
            print(show(permutations(nums)))


main()

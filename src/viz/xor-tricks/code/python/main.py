# Test driver: "single v ...", "missing v ..." and "two v ..." print the answer (the two
# singles smaller first); "swap i j v ..." prints the list after swapping.
import sys

from xor_tricks import missing, single, swap, two_singles


def main():
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        cmd, nums = parts[0], [int(t) for t in parts[1:]]
        if cmd == "single":
            print(single(nums))
        elif cmd == "missing":
            print(missing(nums))
        elif cmd == "two":
            print(*two_singles(nums))
        elif cmd == "swap":
            values = nums[2:]
            swap(values, nums[0], nums[1])
            print(*values)


main()

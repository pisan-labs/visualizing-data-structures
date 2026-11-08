# Test driver: reads one operation per line, prints one result per line.
# "array 2" (or "array 1.5", "array 4") starts an empty dynamic array with that
# growth rule, "counter" an 8-bit counter, and "charge 3" opens a bank.
# "append" and "increment" print the actual cost and the bank after it.
import sys

from amortized import Bank, BinaryCounter, DynamicArray, double

GROWTH = {
    "2": double,
    "1.5": lambda c: max(1, (3 * c + 1) // 2),  # the ceiling of 1.5 * c
    "4": lambda c: c + 4,
}


def main():
    structure = None
    bank = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "array":
            structure = DynamicArray(GROWTH[parts[1]])
        elif op == "counter":
            structure = BinaryCounter()
        elif op == "charge":
            bank = Bank(int(parts[1]))
        else:
            if op == "append":
                cost = structure.append(structure.size + 1)
            else:
                cost = structure.increment()
            out.append(f"{cost} {bank.pay(cost)}")
    sys.stdout.write("".join(line + "\n" for line in out))


main()

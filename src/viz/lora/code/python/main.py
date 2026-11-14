# Test driver: reads one operation per line, prints one result per line.
# "w <16 numbers>" sets the frozen W and "target <16 numbers>" the target update;
# "adapter r alpha <B row by row> <A row by row>" starts a new adapter. None prints.
# "train k" takes k Adam steps and prints the loss, a bar, and the rows of the update;
# "merge" prints the rows of W + update. Three decimals each.
import math
import sys

from lora import LoRA

D = 4


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def rows(m):
    return " / ".join(" ".join(three(v) for v in row) for row in m)


def matrix(vals, cols):
    return [vals[i:i + cols] for i in range(0, len(vals), cols)]


def main():
    w, target, model = None, None, None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "w":
            w = matrix([float(t) for t in args], D)
        elif op == "target":
            target = matrix([float(t) for t in args], D)
        elif op == "adapter":
            r, alpha = int(args[0]), int(args[1])
            vals = [float(t) for t in args[2:]]
            model = LoRA(w, matrix(vals[:D * r], r), matrix(vals[D * r:], D), alpha)
        elif op == "train":
            for _ in range(int(args[0])):
                model.train_step(target)
            print(three(model.loss(target)), "|", rows(model.delta()))
        elif op == "merge":
            print(rows(model.merge()))


main()

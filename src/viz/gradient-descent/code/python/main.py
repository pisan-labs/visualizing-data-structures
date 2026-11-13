# Test driver: reads one operation per line, prints one result per line.
# "surface id" picks the loss, "optimizer method lr beta1 beta2 bias" the method
# and "start x [y]" a starting point and a fresh optimizer; none of them prints.
# "step" takes one step and prints the new point, three decimals per coordinate.
import math
import sys

from optimizers import Adam, GradientDescent, Momentum

GRADIENTS = {
    "bowl": lambda p: [2 * p[0]],
    "wells": lambda p: [p[0] * p[0] * p[0] - 2 * p[0] + 0.3],
    "round": lambda p: [p[0], p[1]],
    "narrow": lambda p: [p[0], 10 * p[1]],
    "valley": lambda p: [-2 * (1 - p[0]) - 20 * p[0] * (p[1] - p[0] * p[0]),
                         10 * (p[1] - p[0] * p[0])],
}


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def make(spec):
    method, lr, beta1, beta2, bias = spec
    if method == "gd":
        return GradientDescent(float(lr))
    if method == "momentum":
        return Momentum(float(lr), float(beta1))
    return Adam(float(lr), float(beta1), float(beta2), bias_correction=bias == "1")


def main():
    grad, spec, opt, x = None, None, None, []
    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "surface":
            grad = GRADIENTS[p[1]]
        elif p[0] == "optimizer":
            spec = p[1:]
        elif p[0] == "start":
            x, opt = [float(t) for t in p[1:]], make(spec)
        elif p[0] == "step":
            x = opt.step(x, grad(x))
            print(" ".join(three(v) for v in x))


main()

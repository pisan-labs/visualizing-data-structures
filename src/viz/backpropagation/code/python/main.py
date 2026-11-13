# Test driver: reads one operation per line, prints one result per line.
# "clear" starts an expression, "var name value" adds a variable and
# "op name kind operands [power]" a node (operands are names or numbers).
# "forward" prints f. "backward" builds the graph afresh from the variables,
# runs the backward pass and prints f and each variable's gradient; the
# variables keep their gradients until "zero".
import math
import sys

from value import Value

BINARY = {
    "add": lambda x, y: x + y,
    "sub": lambda x, y: x - y,
    "mul": lambda x, y: x * y,
    "div": lambda x, y: x / y,
}
UNARY = {
    "neg": lambda x: -x,
    "tanh": Value.tanh,
    "relu": Value.relu,
    "exp": Value.exp,
    "sigmoid": Value.sigmoid,
}


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def main():
    names, leaves, recipe = [], {}, []

    def build():
        vals = dict(leaves)

        def get(t):
            return vals[t] if t[0].isalpha() else Value(float(t))
        for name, kind, args in recipe:
            if kind == "pow":
                vals[name] = get(args[0]) ** int(args[1])
            elif kind in UNARY:
                vals[name] = UNARY[kind](get(args[0]))
            else:
                vals[name] = BINARY[kind](get(args[0]), get(args[1]))
        return vals[recipe[-1][0]]

    for line in sys.stdin:
        p = line.split()
        if not p:
            continue
        if p[0] == "clear":
            names, leaves, recipe = [], {}, []
        elif p[0] == "var":
            names.append(p[1])
            leaves[p[1]] = Value(float(p[2]))
        elif p[0] == "op":
            recipe.append((p[1], p[2], p[3:]))
        elif p[0] == "zero":
            for v in leaves.values():
                v.grad = 0.0
        elif p[0] == "forward":
            print("f", three(build().data))
        elif p[0] == "backward":
            f = build()
            f.backward()
            grads = " ".join(f"{n} {three(leaves[n].grad)}" for n in names)
            print("f", three(f.data), "|", grads)


main()

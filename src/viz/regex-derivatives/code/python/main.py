# Test driver: reads one operation per line, prints one result per line.
#   regex <prefix form>   reads an expression, such as ". * | a b a" for (a|b)*a (prints nothing)
#   derive <c>            prints the derivative by c
#   match <word>          prints "accept" or "reject" (eps is the empty word)
#   dfa                   prints "<k> states, <j> accepting", or "more than 8 states"
import sys

from derivatives import EMPTY, EPS, derive, dfa, matches, show


def parse(tokens):
    t = next(tokens)
    if t in ("|", "."):
        return (t, parse(tokens), parse(tokens))
    if t in ("*", "+", "?"):
        return (t, parse(tokens))
    return {"eps": EPS, "empty": EMPTY}.get(t, ("sym", t))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    r = EMPTY
    for line in sys.stdin:
        op, *args = line.split()
        if op == "regex":
            r = parse(iter(args))
        elif op == "derive":
            print(show(derive(r, args[0])))
        elif op == "match":
            print("accept" if matches(r, "" if args[0] == "eps" else args[0]) else "reject")
        elif op == "dfa":
            result = dfa(r)
            print(f"{result[0]} states, {result[1]} accepting" if result else "more than 8 states")


main()

# Test driver: reads one operation per line, prints one result per line.
#   load S -> aSb | eps   loads a grammar (prints nothing)
#   derive aabb           prints "S => aSb => aaSbb => aabb", or "no", or "gave up"
import sys

from derivation import leftmost_derivation


def parse_grammar(text):
    rules = {}
    start = None
    for item in text.split(";"):
        head, _, body = item.partition("->")
        head = head.strip()
        start = start or head
        for alt in body.split("|"):
            alt = "".join(alt.split())
            rhs = "" if alt == "eps" else alt
            if rhs not in rules.setdefault(head, []):
                rules[head].append(rhs)
    return rules, start


def main():
    rules, start = {}, "S"
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "load":
            rules, start = parse_grammar(arg)
        elif op == "derive":
            word = "" if arg.strip() == "eps" else arg.strip()
            result = leftmost_derivation(rules, start, word)
            if result is None:
                print("no")
            elif result == "gave up":
                print(result)
            else:
                print(" => ".join(form or "eps" for form in result))


main()

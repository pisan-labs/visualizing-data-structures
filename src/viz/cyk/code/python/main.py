# Test driver: reads one operation per line, prints one result per line.
#   load S0 -> U1 S1 | eps; ...   loads a grammar in CNF, symbols separated by spaces
#   parse aabb                    prints "yes" or "no", then the variables in the top cell
import sys

from cyk import cyk


def parse_grammar(text):
    rules, order = [], []
    for item in text.split(";"):
        head, _, body = item.partition("->")
        head = head.strip()
        order.append(head)
        for alt in body.split("|"):
            symbols = tuple(alt.split())
            rules.append((head, () if symbols == ("eps",) else symbols))
    return rules, order


def main():
    rules, order = [], ["S"]
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "load":
            rules, order = parse_grammar(arg)
        elif op == "parse":
            word = "" if arg.strip() == "eps" else arg.strip()
            accepted, table = cyk(rules, order[0], word)
            top = [v for v in order if word and v in table[len(word), 0]]
            print(" ".join(["yes" if accepted else "no"] + top))


main()

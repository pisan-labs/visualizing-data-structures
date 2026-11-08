# Test driver: reads one operation per line, prints one result per line.
#   order bin-first                          BIN before TERM from now on (Sipser)
#   convert S -> A S A | a B; B -> b | eps   prints the grammar in CNF, symbols spaced
import sys

from cnf import to_cnf


def parse(text):
    rules = []
    for item in text.split(";"):
        head, _, body = item.partition("->")
        for alt in body.split("|"):
            symbols = tuple(alt.split())
            rule = (head.strip(), () if symbols == ("eps",) else symbols)
            if rule not in rules:
                rules.append(rule)
    return rules


def show(rules):
    heads = dict.fromkeys(h for h, _ in rules)
    alts = lambda h: " | ".join(" ".join(b) or "eps" for g, b in rules if g == h)
    return "; ".join(f"{h} -> {alts(h)}" for h in heads)


def main():
    term_first = True
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "order":
            term_first = arg.strip() == "term-first"
        elif op == "convert":
            print(show(to_cnf(parse(arg), term_first)))


main()

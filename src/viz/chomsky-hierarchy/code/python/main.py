# Test driver: reads one operation per line, prints one result per line.
#   classify S -> aSb | eps   prints "context-free (not regular: S -> aSb)"
import sys

from chomsky import LEVELS, classify


def parse_rules(text):
    rules = []
    for item in text.split(";"):
        left, _, right = item.partition("->")
        left = "".join(left.split())
        for alt in right.split("|"):
            alt = "".join(alt.split())
            rules.append((left, "" if alt == "eps" else alt))
    start = next(c for c in rules[0][0] if c.isupper())
    return rules, start


def show(rule):
    left, right = rule
    return f"{left} -> {right or 'eps'}"


def main():
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op != "classify":
            continue
        rules, start = parse_rules(arg)
        level, below = classify(rules, start)
        if below is None:
            print(level)
        else:
            print(f"{level} (not {LEVELS[LEVELS.index(level) - 1]}: {show(below)})")


main()

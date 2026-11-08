# Test driver: reads one operation per line, prints one result per line.
#   method lr0 | slr1                 where reduces go in the table
#   load E -> E + T; E -> T; T -> a   one rule per item, symbols spaced (Start -> S is added)
#   table                             prints "states N conflicts K"
#   parse a+a                         prints "accept 7", "reject 3" or "refuse" (conflicts)
import sys

from lr0 import follow_sets, item_sets, lr_table, parse


def load(text):
    rules = []
    for item in text.split(";"):
        head, _, body = item.partition("->")
        symbols = tuple(body.split())
        rule = (head.strip(), () if symbols == ("eps",) else symbols)
        if rule not in rules:
            rules.append(rule)
    return [("Start", (rules[0][0],))] + rules  # a name no grammar here can use


def main():
    slr = False
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "method":
            slr = arg == "slr1"
        elif op == "load":
            rules = load(arg)
            sets, edges = item_sets(rules)
            action, goto = lr_table(rules, sets, edges, follow_sets(rules) if slr else None)
            conflicts = sum(len(a) > 1 for a in action.values())
        elif op == "table":
            print("states", len(sets), "conflicts", conflicts)
        elif op == "parse":
            word = "" if arg == "eps" else arg
            print("refuse" if conflicts else " ".join(map(str, parse(rules, action, goto, word))))


main()

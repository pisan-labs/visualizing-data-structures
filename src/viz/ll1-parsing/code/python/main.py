# Test driver: reads one operation per line, prints one result per line.
#   policy refuse | first        parse with conflicts: refuse, or take the first rule
#   load E -> T X; X -> + T X; X -> eps     one rule per item, symbols spaced
#   first / follow               prints "E: ( a; X: + eps; ..." (sorted, variables in order)
#   table                        prints "conflicts N"
#   parse a+a                    prints "accept 9", "reject 4", "gave-up 40" or "refuse"
import sys

from ll1 import first_follow, is_var, ll1_table, parse


def load(text):
    rules = []
    for item in text.split(";"):
        head, _, body = item.partition("->")
        symbols = tuple(body.split())
        rule = (head.strip(), () if symbols == ("eps",) else symbols)
        if rule not in rules:
            rules.append(rule)
    variables = [rules[0][0]]
    for s in [h for h, _ in rules] + [s for _, b in rules for s in b]:
        if is_var(s) and s not in variables:
            variables.append(s)
    return rules, variables


def show(sets, variables):
    return "; ".join(f"{v}: {' '.join(sorted(sets[v]))}" for v in variables)


def main():
    refuse = True
    for line in sys.stdin:
        op, _, arg = line.strip().partition(" ")
        if op == "policy":
            refuse = arg == "refuse"
        elif op == "load":
            rules, variables = load(arg)
            first, follow = first_follow(rules, variables)
            table = ll1_table(rules, first, follow)
        elif op == "first":
            print(show(first, variables))
        elif op == "follow":
            print(show(follow, variables))
        elif op == "table":
            print("conflicts", sum(len(r) > 1 for r in table.values()))
        elif op == "parse":
            if refuse and any(len(r) > 1 for r in table.values()):
                print("refuse")
            else:
                word = "" if arg == "eps" else arg
                print(*parse(rules, table, word))


main()

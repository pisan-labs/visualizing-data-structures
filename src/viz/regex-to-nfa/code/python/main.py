# Test driver: reads one operation per line, prints one result per line.
#   build <regex>  ->  "<n> states, <m> moves", or "error"
#   run <word>     ->  "accept" or "reject" (ε or eps is the empty word), or "error"
import sys

from thompson import EPS, build


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    nfa = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, arg = parts[0], parts[1] if len(parts) > 1 else ""
        if op == "build":
            try:
                nfa = build(arg)
                moves = sum(len(m) for m in nfa.moves)
                out.append(f"{len(nfa.moves)} states, {moves} moves")
            except ValueError:
                out.append("error")
        elif op == "run":
            word = "" if arg in ("", EPS, "eps") else arg
            if all(c.isascii() and c.isalnum() for c in word):
                out.append("accept" if nfa.accepts(word) else "reject")
            else:
                out.append("error")
    print("\n".join(out))


main()

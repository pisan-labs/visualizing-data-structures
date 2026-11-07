# Test driver: reads one operation per line, prints one line per match.
#   nfa <states> <start> <accept>     a new NFA with no moves yet (prints nothing)
#   move <from> <symbol or eps> <to>  a move; a state's moves are tried in the order given
#   match <word, or eps>              "<backtracking answer> <steps> <simulation answer> <steps>"
import sys

from regex_engines import EPS, NFA, backtrack, simulate


def main():
    nfa = None
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "nfa":
            nfa = NFA(int(parts[1]), int(parts[2]), int(parts[3]))
        elif op == "move":
            nfa.add(int(parts[1]), EPS if parts[2] == "eps" else parts[2], int(parts[3]))
        elif op == "match":
            word = "" if len(parts) < 2 or parts[1] == "eps" else parts[1]
            b_answer, b_steps = backtrack(nfa, word)
            s_answer, s_steps = simulate(nfa, word)
            print(f"{b_answer} {b_steps} {s_answer} {s_steps}")


main()

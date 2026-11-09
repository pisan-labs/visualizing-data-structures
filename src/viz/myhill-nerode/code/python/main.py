# Test driver: reads one operation per line, prints one result per line.
#   dfa <states> / alphabet <symbols> / start <q> / accept <states> / move <p> <c> <q>
#                       a complete DFA (prints nothing)
#   classes             prints "eps a ab | eps-a->a eps-b->eps ...", or "more than 8 classes"
#   apart w1 w2 ...     prints the suffix for each pair (w2,w1) (w3,w1) (w3,w2) ..., - if none
import sys

from nerode import Dfa, apart, classes


def name(w):
    return w if w else "eps"


def main():
    alphabet, start, accept, delta = [], None, [], {}
    for line in sys.stdin:
        op, *args = line.split()
        if op == "dfa":
            alphabet, start, accept, delta = [], None, [], {}
        elif op == "alphabet":
            alphabet = args
        elif op == "start":
            start = args[0]
        elif op == "accept":
            accept = args
        elif op == "move":
            delta[(args[0], args[1])] = args[2]
        elif op == "classes":
            result = classes(Dfa(alphabet, start, accept, delta))
            if result is None:
                print("more than 8 classes")
            else:
                words, moves = result
                arrows = [f"{name(words[i])}-{c}->{name(words[j])}" for i, c, j in moves]
                print(" ".join(map(name, words)), "|", " ".join(arrows))
        elif op == "apart":
            dfa = Dfa(alphabet, start, accept, delta)
            words = ["" if a == "eps" else a for a in args]
            out = []
            for i in range(1, len(words)):
                for j in range(i):
                    z = apart(dfa, words[i], words[j])
                    out.append("-" if z is None else name(z))
            print(" ".join(out))


main()

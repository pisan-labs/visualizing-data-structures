# Test driver: reads one move per line, prints one result per line.
#   adversary <lemma> <lang> <p> <s>        -> splits <n> survive <k> pick <lengths>
#   pump <lemma> <lang> <s> <lengths> <i>   -> <pumped string or eps> in|out
#   prover <lemma> <lang> <s> <lengths>     -> i <i> | none
import sys

from pumping import MEMBER, adversary, prover, pump


def main():
    for line in sys.stdin:
        if not line.split():
            continue
        op, *args = line.split()
        if op == "adversary":
            lemma, lang, p, s = args
            count, survivors, pick = adversary(lang, s, int(p), lemma)
            print(f"splits {count} survive {survivors} pick {' '.join(map(str, pick))}")
        elif op == "pump":
            lemma, lang, s, *rest = args
            parts, i = [int(k) for k in rest[:-1]], int(rest[-1])
            w = pump(s, parts, i, lemma)
            print(w or "eps", "in" if MEMBER[lang](w) else "out")
        elif op == "prover":
            lemma, lang, s, *rest = args
            i = prover(lang, s, [int(k) for k in rest], lemma)
            print("none" if i is None else f"i {i}")


main()

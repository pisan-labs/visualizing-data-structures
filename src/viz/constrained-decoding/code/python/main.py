# Test driver: reads one operation per line, prints one result per line.
# "dfa <start> <accept,...> <state,...> <from:symbol:to> ..." sets the DFA, "vocab <token> ..."
# the tokens and "logits <prev> <logit> ..." the model's row after a token (none print).
# "index" prints each state's allowed tokens. "next <prev> <state> <greedy|sample> <mask 1|0>
# <u>" prints the token chosen and the state it leads to ("dead" if it leaves the DFA).
import sys

from constrained import build_index, next_token, walk


def main():
    dfa, vocab, rows = None, [], {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "dfa":
            delta = {}
            for m in args[3:]:
                p, c, q = m.split(":")
                delta[(p, c)] = q
            dfa = {
                "start": args[0],
                "accept": set(args[1].split(",")),
                "states": args[2].split(","),
                "delta": delta,
            }
        elif op == "vocab":
            vocab = args
        elif op == "logits":
            rows[args[0]] = [float(v) for v in args[1:]]
        elif op == "index":
            index = build_index(dfa, vocab)
            print(" | ".join(
                f"{q}:" + "".join(f" {t}" if t == "</s>" else f" {t}>{to}" for t, to in index[q].items())
                for q in dfa["states"]
            ))
        elif op == "next":
            prev, state, mode, mask, u = args
            allowed = None
            if mask == "1" and state != "dead":
                allowed = build_index(dfa, vocab)[state]
            t = next_token(vocab, rows[prev], allowed, mode == "greedy", float(u))
            to = state if t == "</s>" else (walk(dfa, state, t) if state != "dead" else None)
            print(t, to if to is not None else "dead")


main()

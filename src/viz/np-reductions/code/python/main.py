# Test driver: reads one reduction per line, prints the new instance on one line.
# "sat2is a|!b|c,!a|b" or "is2vc k=2 V=A,B,C E=A-B,B-C" (also is2clique, clique2vc,
# vc2sc). A graph prints as "k=.. V=.. E=..", a set cover as "k=.. U=.. A={1,2} ...".
import sys

from reductions import clique_to_vc, is_to_clique, is_to_vc, sat_to_is, vc_to_sc


def read_graph(fields):
    parts = dict(f.split("=", 1) for f in fields)
    vertices = [v for v in parts["V"].split(",") if v]
    edges = [tuple(e.split("-")) for e in parts["E"].split(",") if e]
    return vertices, edges, int(parts["k"])


def show_graph(vertices, edges, k):
    return f"k={k} V={','.join(vertices)} E={','.join(f'{u}-{v}' for u, v in edges)}"


def main():
    graph_ops = {"is2vc": is_to_vc, "is2clique": is_to_clique, "clique2vc": clique_to_vc}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op = parts[0]
        if op == "sat2is":
            clauses = [c.split("|") for c in parts[1].split(",")]
            print(show_graph(*sat_to_is(clauses)))
        elif op in graph_ops:
            print(show_graph(*graph_ops[op](*read_graph(parts[1:]))))
        elif op == "vc2sc":
            m, sets, k = vc_to_sc(*read_graph(parts[1:]))
            listed = " ".join(f"{v}={{{','.join(map(str, s))}}}" for v, s in sets.items())
            print(f"k={k} U={m} {listed}")


main()

# Test driver: reads one operation per line, prints one result per line.
# "graph <directed|undirected> <names>" numbers the vertices 0..n-1 in that order.
import sys

from dfs import DFS

LETTER = {"tree": "T", "back": "B", "forward": "F", "cross": "C"}


def main():
    names, index, adj, edges, directed = [], {}, [], [], False
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "graph":
            directed = args[0] == "directed"
            names = args[1:]
            index = {name: i for i, name in enumerate(names)}
            adj, edges = [[] for _ in names], []
        elif op == "edge":
            u, v = index[args[0]], index[args[1]]
            edges.append((u, v))
            adj[u].append(v)
            if not directed:
                adj[v].append(u)
        elif op == "dfs":
            for a in adj:
                a.sort()
            r = DFS(adj, index[args[0]], directed)
            kinds = []
            for u, v in edges:
                kind = r.kind.get((u, v)) or r.kind.get((v, u))
                kinds.append(f"{names[u]}-{names[v]}:{LETTER[kind]}")
            print(
                " ".join(map(str, r.d)),
                "|",
                " ".join(map(str, r.f)),
                "|",
                " ".join("-" if p is None else names[p] for p in r.pi),
                "|",
                " ".join(kinds),
            )


main()

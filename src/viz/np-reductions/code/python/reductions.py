# Polynomial-time reductions. None of them solves anything: each one only
# builds a new instance whose answer is the same as the old one's.


def sat_to_is(clauses):
    """3-SAT to INDEPENDENT-SET. A clause is a list of literals such as "a" or "!b".
    One vertex per literal ("!b2" is the !b of clause 2), joined within a clause,
    and every x joined to every !x in another clause. k = number of clauses."""
    vertices, edges, names = [], [], []
    for j, clause in enumerate(clauses):
        vs = [f"{lit}{j + 1}" for lit in clause]
        names.append(vs)
        vertices += vs
        edges += [(vs[a], vs[b]) for a in range(len(vs)) for b in range(a + 1, len(vs))]
    for i in range(len(clauses)):
        for j in range(i + 1, len(clauses)):
            for a, x in enumerate(clauses[i]):
                for b, y in enumerate(clauses[j]):
                    if x.lstrip("!") == y.lstrip("!") and x != y:
                        edges.append((names[i][a], names[j][b]))
    return vertices, edges, len(clauses)


def complement(vertices, edges):
    """Every pair of vertices that is not an edge."""
    joined = {frozenset(e) for e in edges}
    n = len(vertices)
    return [(vertices[i], vertices[j]) for i in range(n) for j in range(i + 1, n)
            if frozenset((vertices[i], vertices[j])) not in joined]


def is_to_vc(vertices, edges, k):
    """S is independent exactly when V - S touches every edge."""
    return vertices, edges, len(vertices) - k


def is_to_clique(vertices, edges, k):
    """S is independent in G exactly when S is a clique in the complement."""
    return vertices, complement(vertices, edges), k


def clique_to_vc(vertices, edges, k):
    """S is a clique in G exactly when V - S covers the complement."""
    return vertices, complement(vertices, edges), len(vertices) - k


def vc_to_sc(vertices, edges, k):
    """One element per edge (numbered from 1), one set per vertex: the edges it touches."""
    sets = {v: [i + 1 for i, e in enumerate(edges) if v in e] for v in vertices}
    return len(edges), sets, k

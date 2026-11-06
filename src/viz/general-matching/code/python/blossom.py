from collections import deque


def max_matching(adj):
    """Edmonds' blossom algorithm. adj[v] lists v's neighbours in increasing order.

    Returns mate, where mate[v] is v's partner or -1. Each phase grows an
    alternating forest from every free vertex; base[v] is v's blossom base.
    """
    n = len(adj)
    mate = [-1] * n
    while True:
        even = [False] * n
        odd = [False] * n
        p = [-1] * n
        base = list(range(n))
        root = list(range(n))
        queue = deque(v for v in range(n) if mate[v] == -1)
        for v in queue:
            even[v] = True

        def lca(a, b):
            seen = set()
            while True:
                a = base[a]
                seen.add(a)
                if mate[a] == -1:
                    break
                a = p[mate[a]]
            while base[b] not in seen:
                b = p[mate[base[b]]]
            return base[b]

        def mark_path(v, b, child, in_blossom):
            while base[v] != b:
                in_blossom[base[v]] = in_blossom[base[mate[v]]] = True
                p[v] = child
                child = mate[v]
                v = p[mate[v]]

        def flip(e):  # flip the path from even vertex e to its root
            m = mate[e]
            while m != -1:
                pm = p[m]
                nm = mate[pm]
                mate[m], mate[pm] = pm, m
                m = nm

        augmented = False
        while queue and not augmented:
            v = queue.popleft()
            for w in adj[v]:
                if base[v] == base[w] or mate[v] == w or odd[w]:
                    continue
                if not even[w]:  # w is matched and in no tree
                    odd[w] = True
                    p[w] = v
                    m = mate[w]
                    even[m] = True
                    root[w] = root[m] = root[v]
                    queue.append(m)
                elif root[w] != root[v]:  # augmenting path
                    flip(v)
                    flip(w)
                    mate[v], mate[w] = w, v
                    augmented = True
                    break
                else:  # a blossom: contract it into its base
                    b = lca(v, w)
                    in_blossom = [False] * n
                    mark_path(v, b, w, in_blossom)
                    mark_path(w, b, v, in_blossom)
                    for x in range(n):
                        if in_blossom[base[x]]:
                            base[x] = b
                            if not even[x]:
                                even[x], odd[x] = True, False
                                queue.append(x)
        if not augmented:
            return mate

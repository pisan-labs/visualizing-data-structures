import math


def scores(q, k, i, cols, causal):
    """Row i's scores q_i . k_j / sqrt(d_k) for the keys in cols it may see."""
    out = []
    for j in cols:
        if causal and j > i:
            continue  # the mask: a word sees only itself and the words before it
        s = 0.0
        for t in range(len(q[i])):
            s += q[i][t] * k[j][t]
        out.append((j, s / math.sqrt(len(q[i]))))
    return out


def update(i, seen, v, m, l, o):
    """The online softmax: fold one tile's scores into row i's running m, l and o."""
    mt = max(s for _, s in seen)
    p = [(j, math.exp(s - mt)) for j, s in seen]
    lt = 0.0
    for _, e in p:
        lt += e
    m_new = max(m[i], mt)
    a, b = math.exp(m[i] - m_new), math.exp(mt - m_new)  # rescale the old, and the new
    l_new = a * l[i] + b * lt
    for c in range(len(o[i])):
        pv = 0.0
        for j, e in p:
            pv += e * v[j][c]
        o[i][c] = (l[i] * a * o[i][c] + b * pv) / l_new
    m[i], l[i] = m_new, l_new


def flash_attention(q, k, v, br, bc, causal=True, q_outside=False):
    """Attention one tile at a time: Q in blocks of br rows, K and V in blocks of bc.

    The n x n table of scores is never stored. Returns O, m, l and the numbers moved
    to and from slow memory (HBM): [Q, K and V, O m l, the table].
    """
    n, d = len(q), len(v[0])
    m, l = [-math.inf] * n, [0.0] * n
    o = [[0.0] * d for _ in range(n)]
    moved = [0, 0, 0, 0]
    q_blocks = [range(i, min(i + br, n)) for i in range(0, n, br)]
    kv_blocks = [range(j, min(j + bc, n)) for j in range(0, n, bc)]

    def tile(rows, cols):
        for i in rows:
            seen = scores(q, k, i, cols, causal)
            if seen:
                update(i, seen, v, m, l, o)

    def hidden(rows, cols):  # every score in the tile is masked
        return causal and rows[-1] < cols[0]

    if q_outside:  # FlashAttention-2's loop order
        for rows in q_blocks:
            moved[0] += len(rows) * d  # read Q_i
            for cols in kv_blocks:
                if not hidden(rows, cols):
                    moved[1] += 2 * len(cols) * d  # read K_j and V_j
                    tile(rows, cols)
            moved[2] += len(rows) * d  # write O_i
    else:  # the 2022 paper's loop order
        moved[2] += n * d + 2 * n  # O, l and m start in HBM
        for cols in kv_blocks:
            moved[1] += 2 * len(cols) * d  # read K_j and V_j, once
            for rows in q_blocks:
                if not hidden(rows, cols):
                    moved[0] += len(rows) * d  # read Q_i
                    moved[2] += 2 * (len(rows) * d + 2 * len(rows))  # O_i, l_i, m_i in and out
                    tile(rows, cols)
    return o, m, l, moved


def attention(q, k, v, causal=True):
    """Plain attention, for comparison: the whole table of scores, then softmax by rows."""
    n, d = len(q), len(v[0])
    o, m, l = [], [], []
    for i in range(n):
        row = [-math.inf] * n
        for j, s in scores(q, k, i, range(n), causal):
            row[j] = s
        mx = max(row)
        e = [math.exp(s - mx) for s in row]
        total = 0.0
        for x in e:
            total += x
        out = []
        for c in range(d):
            z = 0.0
            for j in range(n):
                z += e[j] / total * v[j][c]
            out.append(z)
        o.append(out)
        m.append(mx)
        l.append(total)
    # Q; K and V; O; and S and P, each written to HBM and read back.
    return o, m, l, [n * d, 2 * n * d, n * d, 4 * n * n]

import math

EPS = 1e-5


def matmul(a, b):
    """a (n x m) times b (m x p), each sum in index order."""
    out = []
    for row in a:
        r = []
        for j in range(len(b[0])):
            s = 0.0
            for t in range(len(b)):
                s += row[t] * b[t][j]
            r.append(s)
        out.append(r)
    return out


def add(a, b):
    return [x + y for x, y in zip(a, b)]


def norm(v, kind):
    """LayerNorm or RMSNorm with gamma = 1 and beta = 0."""
    d = len(v)
    if kind == "layer":
        s = 0.0
        for x in v:
            s += x
        mean = s / d
        q = 0.0
        for x in v:
            q += (x - mean) * (x - mean)
        scale = math.sqrt(q / d + EPS)
        return [(x - mean) / scale for x in v]
    q = 0.0
    for x in v:
        q += x * x
    scale = math.sqrt(q / d + EPS)
    return [x / scale for x in v]


def softmax(scores):
    m = max(scores)
    e = [math.exp(s - m) for s in scores]
    total = 0.0
    for x in e:
        total += x
    return [x / total for x in e]


def attention(x, w):
    """One causal head: returns z for every word (n x d_k) and the weights."""
    q, k, v = matmul(x, w["q"]), matmul(x, w["k"]), matmul(x, w["v"])
    n, dk = len(x), len(q[0])
    a = []
    for i in range(n):
        scores = []
        for j in range(n):
            s = 0.0
            for t in range(dk):
                s += q[i][t] * k[j][t]
            scores.append(s / math.sqrt(dk) if j <= i else -math.inf)
        a.append(softmax(scores))
    return matmul(a, v), a


def gelu(x):
    return 0.5 * x * (1 + math.tanh(math.sqrt(2 / math.pi) * (x + 0.044715 * x * x * x)))


def silu(x):
    return x / (1 + math.exp(-x))


def feed_forward(v, w, act):
    if act == "swiglu":
        g = matmul([v], w["wg"])[0]
        u = matmul([v], w["wu"])[0]
        return matmul([[silu(a) * b for a, b in zip(g, u)]], w["wd"])[0]
    g = add(matmul([v], w["w1"])[0], w["b1"])
    h = [max(a, 0.0) if act == "relu" else gelu(a) for a in g]
    return add(matmul([h], w["w2"])[0], w["b2"])


def block(x, w, order="pre", kind="layer", act="gelu"):
    """One transformer block on the words x (rows of the stream), then the unembedding.

    Follows the last word. Returns its attention weights, the stream after each
    sublayer (x1, x2) and the logits over the vocabulary (the columns of w["u"]).
    """
    last = len(x) - 1
    if order == "pre":
        z, a = attention([norm(r, kind) for r in x], w)
        x1 = add(x[last], matmul(z, w["o"])[last])      # x1 = x + attn(norm(x))
        x2 = add(x1, feed_forward(norm(x1, kind), w, act))  # x2 = x1 + ffn(norm(x1))
        h = norm(x2, kind)                                  # the final norm
    else:
        z, a = attention(x, w)
        x1 = norm(add(x[last], matmul(z, w["o"])[last]), kind)  # x1 = norm(x + attn(x))
        x2 = norm(add(x1, feed_forward(x1, w, act)), kind)      # x2 = norm(x1 + ffn(x1))
        h = x2
    logits = matmul([h], w["u"])[0]
    return a[last], x1, x2, logits

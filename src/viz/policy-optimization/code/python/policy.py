import math


def softmax(z):
    m = max(z)
    e = [math.exp(x - m) for x in z]
    total = 0.0
    for x in e:
        total += x
    return [x / total for x in e]


def draw(p, u):
    """The answer whose stretch of 0 to 1, in order, holds u."""
    cum = 0.0
    for k, pk in enumerate(p):
        cum += pk
        if u < cum:
            return k
    k = len(p) - 1
    while k > 0 and p[k] <= 0:
        k -= 1
    return k


def mean(xs):
    total = 0.0
    for x in xs:
        total += x
    return total / len(xs)


def advantages(method, rewards, group, p_old, p_ref, beta, v):
    """How much better than expected each sampled answer was.

    REINFORCE: the reward itself. PPO: the reward minus the critic's value v.
    Both fold the KL penalty into the reward. GRPO: the reward against the
    group, (r - mean) / std, with no critic.
    """
    r = [rewards[a] for a in group]
    if method == "grpo":
        m = mean(r)
        sq = 0.0
        for x in r:
            sq += (x - m) * (x - m)
        std = math.sqrt(sq / len(r))
        return [(x - m) / std if std > 0 else 0.0 for x in r], r
    shaped = [r[i] - beta * math.log(p_old[a] / p_ref[a]) for i, a in enumerate(group)]
    if method == "ppo":
        return [s - v for s in shaped], shaped
    return shaped, shaped


def policy_pass(method, z, p_old, p_ref, group, adv, eps, beta, lr):
    """One gradient step on the logits z from a group of answers.

    A sample stops counting once its ratio pi/pi_old has left [1 - eps, 1 + eps]
    the way its advantage pushes (PPO's clip). GRPO also pulls toward p_ref.
    Returns the new logits and which samples were clipped.
    """
    p = softmax(z)
    n = len(z)
    g = [0.0] * n
    clipped = []
    for i, a in enumerate(group):
        rho = 1.0 if method == "reinforce" else p[a] / p_old[a]
        A = adv[i]
        clip = method != "reinforce" and ((A > 0 and rho > 1 + eps) or (A < 0 and rho < 1 - eps))
        clipped.append(clip)
        if not clip:
            coef = A * rho
            for k in range(n):
                g[k] += coef * ((1 if k == a else 0) - p[k])
        if method == "grpo":
            kc = -beta * (1 - p_ref[a] / p[a])
            for k in range(n):
                g[k] += kc * ((1 if k == a else 0) - p[k])
    return [z[k] + lr * (g[k] / len(group)) for k in range(n)], clipped


def rl_step(method, z, z_ref, rewards, v, us, eps, beta, lr=0.5, passes=2):
    """Draw a group with the uniform numbers us, then update. Returns z, v and details."""
    p_old, p_ref = softmax(z), softmax(z_ref)
    group = [draw(p_old, u) for u in us]
    adv, shaped = advantages(method, rewards, group, p_old, p_ref, beta, v)
    clipped = []
    for _ in range(1 if method == "reinforce" else passes):
        z, clipped = policy_pass(method, z, p_old, p_ref, group, adv, eps, beta, lr)
    if method == "ppo":
        v = v + 0.5 * (mean(shaped) - v)  # the critic moves halfway to the average reward
    return z, v, group, adv, clipped


def dpo_step(z, z_ref, winner, loser, beta, lr=0.5):
    """DPO on logits: the loss -log sigmoid(h) for one preference pair."""
    h = beta * ((z[winner] - z_ref[winner]) - (z[loser] - z_ref[loser]))
    sig = 1 / (1 + math.exp(-h))
    step = lr * beta * (1 - sig)
    z = list(z)
    z[winner] = z[winner] + step
    z[loser] = z[loser] - step
    return z, h

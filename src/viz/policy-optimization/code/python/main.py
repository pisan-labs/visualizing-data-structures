# Test driver: reads one operation per line, prints one result per line.
# "ref z1..z4", "logits z1..z4", "rewards r1..r4" and "critic v" set the state.
# "rl method eps beta u1..u4" draws a group and updates; it prints the group | the
# advantages | which samples the last pass clipped | the new policy | v.
# "dpo beta u..." draws pairs from the reference until their rewards differ, updates,
# and prints winner loser | h | the new policy.
import math
import sys

from policy import draw, dpo_step, rl_step, softmax


def three(x):
    k = math.floor(abs(x) * 1000 + 0.5)
    sign = "-" if x < 0 and k > 0 else ""
    return f"{sign}{k // 1000}.{k % 1000:03d}"


def line(xs):
    return " ".join(three(x) for x in xs)


def main():
    z_ref, z, rewards, v = [], [], [], 0.0
    for text in sys.stdin:
        p = text.split()
        if not p:
            continue
        op, args = p[0], p[1:]
        if op == "ref":
            z_ref = [float(x) for x in args]
        elif op == "logits":
            z = [float(x) for x in args]
        elif op == "rewards":
            rewards = [float(x) for x in args]
        elif op == "critic":
            v = float(args[0])
        elif op == "rl":
            method, eps, beta = args[0], float(args[1]), float(args[2])
            us = [float(u) for u in args[3:]]
            z, v, group, adv, clipped = rl_step(method, z, z_ref, rewards, v, us, eps, beta)
            flags = "-" if method == "reinforce" else "".join("1" if c else "0" for c in clipped)
            print(" ".join(str(a) for a in group), "|", line(adv), "|", flags, "|",
                  line(softmax(z)), "|", three(v))
        elif op == "dpo":
            beta = float(args[0])
            us = iter(float(u) for u in args[1:])
            p_ref = softmax(z_ref)
            x, y = draw(p_ref, next(us)), draw(p_ref, next(us))
            while rewards[x] == rewards[y]:
                x, y = draw(p_ref, next(us)), draw(p_ref, next(us))
            w, l = (x, y) if rewards[x] > rewards[y] else (y, x)
            z, h = dpo_step(z, z_ref, w, l, beta)
            print(w, l, "|", three(h), "|", line(softmax(z)))


main()

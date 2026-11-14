NEG = float("-inf")  # a state you cannot be in


def best_plan(prices, cooldown=True, fee=0):
    """Most money from trading one item, holding at most one: (profit, [(action, day), ...])."""
    n = len(prices)
    free = [0] * (n + 1)  # holding nothing at the end of day t
    hold = [NEG] * (n + 1)  # holding the item
    cool = [NEG] * (n + 1)  # sold on day t, so day t + 1 is a rest
    for t in range(1, n + 1):
        p = prices[t - 1]
        hold[t] = max(hold[t - 1], free[t - 1] - p)  # keep it, or buy today
        if cooldown:
            free[t] = max(free[t - 1], cool[t - 1])  # rest, or rest after a sale
            cool[t] = hold[t - 1] + p - fee  # sell today
        else:
            free[t] = max(free[t - 1], hold[t - 1] + p - fee)  # rest, or sell today
    state = "cool" if cooldown and cool[n] > free[n] else "free"
    best = max(free[n], cool[n])
    plan = []
    for t in range(n, 0, -1):  # walk back: which way in made each value?
        if state == "hold":
            if hold[t] != hold[t - 1]:
                plan.append(("buy", t))
                state = "free"
        elif state == "cool":
            plan.append(("sell", t))
            state = "hold"
        elif free[t] != free[t - 1]:
            if cooldown:
                state = "cool"
            else:
                plan.append(("sell", t))
                state = "hold"
    return best, plan[::-1]

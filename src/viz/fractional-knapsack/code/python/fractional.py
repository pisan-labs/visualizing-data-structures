from fractions import Fraction


def fractional_knapsack(items, capacity):
    """The most value that fits when items can be cut.

    items is a list of (weight, value) pairs. Returns the value as an exact Fraction.
    """
    # Best value per weight first; sorted() is stable, so ties keep their order.
    order = sorted(items, key=lambda it: Fraction(it[1], it[0]), reverse=True)
    left = capacity
    total = Fraction(0)
    for weight, value in order:
        if left == 0:
            break
        if weight <= left:
            total += value  # take all of it
            left -= weight
        else:
            total += Fraction(value * left, weight)  # take the part that fits
            left = 0
    return total

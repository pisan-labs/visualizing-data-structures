"""What a function can and cannot do to its caller's variables.

Every Python variable holds a reference. Calling f(xs) copies that reference into f's
parameter, so f can change the list, but not which list xs refers to.
"""


def grow(a):
    a.append(0)  # changes the list the caller's variable refers to


def reset(a):
    a = [0]  # points only this function's a at a new list
    return a


def bump(n):
    n = n + 1  # changes only this function's n
    return n


if __name__ == "__main__":
    xs = [1, 2]
    ys = xs  # ys and xs are two names for one list
    ys.append(3)
    print(xs)  # [1, 2, 3]
    grow(xs)
    print(xs)  # [1, 2, 3, 0]
    reset(xs)
    print(xs)  # still [1, 2, 3, 0]

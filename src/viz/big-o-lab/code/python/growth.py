"""Loops that do 1, log n, n, n log n, n^2, 2^n and n! steps. Each returns its step count."""


def constant(n):
    return 1


def logarithmic(n):
    steps = 0
    while n > 1:
        n = n // 2
        steps += 1
    return steps


def linear(n):
    steps = 0
    for _ in range(n):
        steps += 1
    return steps


def linearithmic(n):
    steps = 0
    for _ in range(n):
        steps += logarithmic(n)  # halve n until 1, once per item
    return steps


def quadratic(n):
    steps = 0
    for _ in range(n):
        for _ in range(n):
            steps += 1
    return steps


def exponential(n):
    if n == 0:
        return 1
    return exponential(n - 1) + exponential(n - 1)  # two calls, each one smaller


def factorial(n):
    if n == 0:
        return 1
    return sum(factorial(n - 1) for _ in range(n))  # n calls, each one smaller

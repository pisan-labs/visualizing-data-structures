"""Dining philosophers on real threads, with both fixes.

dine is what you write with real threads. Each fork is a threading.Lock.
fix="order": every philosopher takes the lower-numbered of its forks first, so the
last one takes its right fork first; one global order, so no cycle of waits.
fix="waiter": a semaphore that starts at n - 1 lets at most n - 1 reach for forks.

Table runs the page's program one step at a time instead, keeping the forks by hand,
so a caller can pick the interleaving (and find the deadlock).
"""
import threading
from collections import deque


def forks_of(n, i, fix):
    """The two forks philosopher i takes, in its order. Its left fork is i, its right i + 1."""
    left, right = i, (i + 1) % n
    return (right, left) if fix == "order" and i == n - 1 else (left, right)


def dine(n, meals, fix="order"):
    """n philosophers each eat `meals` times, on real threads. Returns the meals eaten."""
    forks = [threading.Lock() for _ in range(n)]
    waiter = threading.Semaphore(n - 1)
    eaten = [0] * n

    def philosopher(i):
        first, second = forks_of(n, i, fix)
        for _ in range(meals):
            if fix == "waiter":
                waiter.acquire()
            with forks[first]:
                with forks[second]:
                    eaten[i] += 1  # eat: only philosopher i writes eaten[i]
            if fix == "waiter":
                waiter.release()

    threads = [threading.Thread(target=philosopher, args=(i,)) for i in range(n)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return eaten


class Table:
    """Philosopher t: [sit], take its first fork, take its second, eat, put the second
    down, put the first down, [leave]. sit and leave are the waiter's P and V."""

    def __init__(self, n, fix):
        self.n, self.fix = n, fix
        self.holder = [None] * n  # who holds each fork
        self.line = [deque() for _ in range(n)]  # who waits for each fork
        self.seats = n - 1  # the waiter; below 0 it counts the philosophers waiting
        self.seat_line = deque()
        self.pc = [0] * n
        self.waits = [None] * n  # "f2" or "waiter" while blocked
        self.ate = []
        self.plans = [self.plan(t) for t in range(n)]

    def plan(self, t):
        a, b = forks_of(self.n, t, self.fix)
        steps = [("take", a), ("take", b), ("eat", t), ("put", b), ("put", a)]
        return [("sit", 0)] + steps + [("leave", 0)] if self.fix == "waiter" else steps

    def step(self, t):
        """Run philosopher t's next step. False if it is done or waits."""
        if self.pc[t] == len(self.plans[t]) or self.waits[t]:
            return False
        kind, f = self.plans[t][self.pc[t]]
        if kind == "take" and self.holder[f] is not None:
            self.line[f].append(t)
            self.waits[t] = f"f{f + 1}"
            return True
        if kind == "take":
            self.holder[f] = t
        elif kind == "put":  # hand it to the first in line, if any
            self.holder[f] = self.line[f].popleft() if self.line[f] else None
            if self.holder[f] is not None:
                self.wake(self.holder[f])
        elif kind == "eat":
            self.ate.append(t)
        elif kind == "sit":
            self.seats -= 1
            if self.seats < 0:
                self.seat_line.append(t)
                self.waits[t] = "waiter"
                return True
        elif kind == "leave":
            self.seats += 1
            if self.seat_line:
                self.wake(self.seat_line.popleft())
        self.pc[t] += 1
        return True

    def wake(self, t):
        self.waits[t] = None
        self.pc[t] += 1  # its take or sit returns

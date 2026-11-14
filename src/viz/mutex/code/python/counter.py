"""count = count + 1 inside a lock, so no update is lost.

Counter is what you write with real threads: `with self.lock` takes the lock
and lets go of it after the store. Steps runs the same five steps one at a time,
so a caller can pick the interleaving; it keeps the lock by hand (who holds it,
who waits in line), because one test thread cannot hold a real lock "for" another.
"""
import threading
from collections import deque


class Counter:
    def __init__(self):
        self.count = 0
        self.lock = threading.Lock()

    def increment(self):
        with self.lock:  # lock(m) ... unlock(m)
            r = self.count  # load
            r = r + 1  # add, in a local variable
            self.count = r  # store


def run_threads(k):
    """k real threads each increment once, all at the same time."""
    c = Counter()
    threads = [threading.Thread(target=c.increment) for _ in range(k)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return c.count


class Steps:
    """k threads, each: lock(m), r = count, r = r + 1, count = r, unlock(m)."""

    def __init__(self, k):
        self.count = 0
        self.holder = None  # the thread that holds m, or None
        self.line = deque()  # threads waiting for m, first in line first
        self.pc = [0] * k  # each thread's next step
        self.reg = [0] * k  # each thread's r

    def step(self, t):
        """Run thread t's next step. False if it is done or waits in line."""
        if self.pc[t] == 5 or t in self.line:
            return False
        part = self.pc[t]
        if part == 0:  # lock(m)
            if self.holder is not None:
                self.line.append(t)  # wait; this thread takes no more steps
                return True
            self.holder = t
        elif part == 1:
            self.reg[t] = self.count
        elif part == 2:
            self.reg[t] = self.reg[t] + 1
        elif part == 3:
            self.count = self.reg[t]
        else:  # unlock(m): hand m to the first in line, whose lock(m) returns
            self.holder = self.line.popleft() if self.line else None
            if self.holder is not None:
                self.pc[self.holder] = 1
        self.pc[t] += 1
        return True

"""Barriers on real threads: nobody goes on until all n have arrived.

OneShot is Downey's barrier: a count guarded by a lock, and a semaphore that starts at
0 as a turnstile. Barrier is his reusable two-phase barrier with preloaded turnstiles:
the last to arrive lets all n through the first, and the last to leave lets all n
through the second, so nobody can lap the others. (Python has threading.Barrier built
in; these show how one is made.)

Steps runs the page's barrier one step at a time instead, keeping the semaphore by
hand, so a caller can pick the interleaving.
"""
import threading
from collections import deque


class OneShot:
    def __init__(self, n):
        self.n, self.count = n, 0
        self.m = threading.Lock()  # guards count
        self.b = threading.Semaphore(0)  # the turnstile, shut

    def wait(self):
        with self.m:
            self.count += 1
            r = self.count
        if r == self.n:
            self.b.release()  # the last to arrive opens the turnstile
        self.b.acquire()  # P(b)
        self.b.release()  # V(b): let the next one through


class Barrier:
    def __init__(self, n):
        self.n, self.count = n, 0
        self.m = threading.Lock()
        self.b1, self.b2 = threading.Semaphore(0), threading.Semaphore(0)

    def wait(self):
        with self.m:
            self.count += 1
            if self.count == self.n:
                for _ in range(self.n):
                    self.b1.release()  # let all n through the first turnstile
        self.b1.acquire()
        with self.m:
            self.count -= 1
            if self.count == 0:
                for _ in range(self.n):
                    self.b2.release()  # and all n through the second
        self.b2.acquire()


def run_threads(n, rounds):
    """n real threads at a one-shot barrier, then `rounds` times round a reusable one.
    Returns how many times a thread went on before all had arrived (0 when it works)."""
    guard = threading.Lock()
    arrived = [0] * n
    bad = [0]
    once, again = OneShot(n), Barrier(n)

    def arrive(i):
        with guard:
            arrived[i] += 1

    def check(k):
        with guard:
            bad[0] += min(arrived) < k

    def job(i):
        arrive(i)
        once.wait()
        check(1)
        for k in range(2, rounds + 2):
            arrive(i)
            again.wait()
            check(k)

    threads = [threading.Thread(target=job, args=(i,)) for i in range(n)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return bad[0]


class Steps:
    """Thread t: count += 1 (r = count); if r == 3: V(b); P(b); V(b); go. Naive: count
    += 1, then go. go notes a thread that leaves while count < 3."""

    def __init__(self, naive=False):
        self.count, self.b, self.line = 0, 0, deque()
        self.pc, self.r = [0] * 3, [0] * 3
        self.blocked, self.early = [False] * 3, [False] * 3
        self.plan = ["arrive", "go"] if naive else ["arrive", "last", "P", "V", "go"]

    def step(self, t):
        """Run thread t's next step. False if it is done or waits."""
        if self.pc[t] == len(self.plan) or self.blocked[t]:
            return False
        what = self.plan[self.pc[t]]
        if what == "arrive":
            self.count += 1
            self.r[t] = self.count
        elif what == "last" and self.r[t] == 3:
            self.V()
        elif what == "P":
            self.b -= 1
            if self.b < 0:
                self.line.append(t)
                self.blocked[t] = True
                return True
        elif what == "V":
            self.V()
        elif what == "go":
            self.early[t] = self.count < 3
        self.pc[t] += 1
        return True

    def V(self):
        self.b += 1
        if self.line:  # the first waiting goes on: its P returns
            w = self.line.popleft()
            self.blocked[w] = False
            self.pc[w] += 1

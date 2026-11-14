"""A read-write lock from a lock, a count and a semaphore (Downey's lightswitch).

Readers share the room; a writer needs it alone. n counts the readers inside and the
lock m guards n. The first reader in takes room, which keeps writers out; the last one
out gives it back. With no_starve=True everyone also passes a turnstile, which a waiting
writer holds, so readers who come after it wait behind it.

Python's threading has no read-write lock, so this is one to use. (Java has
ReentrantReadWriteLock; C++17 has std::shared_mutex.)

Steps runs the page's program (readers first) one step at a time instead, keeping the
lock and the semaphore by hand, so a caller can pick the interleaving.
"""
import threading
from collections import deque


class RWLock:
    def __init__(self, no_starve=False):
        self.m = threading.Lock()  # guards n
        self.n = 0  # readers inside
        self.room = threading.Semaphore(1)  # held by the readers together, or one writer
        self.turn = threading.Semaphore(1) if no_starve else None

    def read_lock(self):
        if self.turn:
            self.turn.acquire()
            self.turn.release()
        with self.m:
            self.n += 1
            if self.n == 1:
                self.room.acquire()  # the first reader in locks the writers out

    def read_unlock(self):
        with self.m:
            self.n -= 1
            if self.n == 0:
                self.room.release()  # the last reader out lets them in

    def write_lock(self):
        if self.turn:
            self.turn.acquire()
        self.room.acquire()

    def write_unlock(self):
        if self.turn:
            self.turn.release()
        self.room.release()


def run_threads(k, rounds, no_starve=False):
    """k readers and one writer, `rounds` visits each. Returns how many times a thread
    found the room shared with a writer (0 when the lock works)."""
    rw = RWLock(no_starve)
    guard = threading.Lock()
    inside = {"r": 0, "w": 0}
    bad = [0]

    def visit(kind):
        with guard:
            inside[kind] += 1
            if inside["w"] and (inside["r"] or inside["w"] > 1):
                bad[0] += 1
        with guard:
            inside[kind] -= 1

    def reader():
        for _ in range(rounds):
            rw.read_lock()
            visit("r")
            rw.read_unlock()

    def writer():
        for _ in range(rounds):
            rw.write_lock()
            visit("w")
            rw.write_unlock()

    threads = [threading.Thread(target=writer)]
    threads += [threading.Thread(target=reader) for _ in range(k)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return bad[0]


# The page's steps. Writer (thread 0): P(room), write, V(room). Reader: lock(m) and
# n += 1; if n == 1: P(room), then unlock(m); read; lock(m) and n -= 1; if n == 0:
# V(room), then unlock(m). Each pair is one step unless it waits in the middle.
WRITER = [["P"], ["write"], ["V"]]
READER = [["lock", "add"], ["first", "unlock"], ["read"], ["lock", "sub"], ["last", "unlock"]]


class Steps:
    def __init__(self, k):
        self.n, self.room = 0, 1
        self.holder, self.m_line, self.room_line = None, deque(), deque()
        self.plans = [WRITER] + [READER] * k
        self.at = [(0, 0)] * (k + 1)  # (row, part) of each thread
        self.r = [0] * (k + 1)  # each reader's copy of n
        self.waits = [None] * (k + 1)  # "m" or "room" while blocked

    def done(self, t):
        return self.at[t][0] == len(self.plans[t])

    def step(self, t):
        """Run thread t's next step (one row). False if it is done or waits."""
        if self.done(t) or self.waits[t]:
            return False
        row = self.at[t][0]
        while not self.done(t) and self.at[t][0] == row and not self.waits[t]:
            self.part(t, self.plans[t][row][self.at[t][1]])
        return True

    def advance(self, t):
        row, part = self.at[t]
        self.at[t] = (row, part + 1) if part + 1 < len(self.plans[t][row]) else (row + 1, 0)

    def part(self, t, what):
        if what == "lock" and self.holder is not None:
            self.m_line.append(t)
            self.waits[t] = "m"
            return
        if what == "lock":
            self.holder = t
        elif what == "unlock":  # hand m to the first in line
            self.holder = self.m_line.popleft() if self.m_line else None
            if self.holder is not None:
                self.wake(self.holder)
        elif what in ("add", "sub"):
            self.n += 1 if what == "add" else -1
            self.r[t] = self.n
        elif what == "P" or (what == "first" and self.r[t] == 1):
            self.room -= 1
            if self.room < 0:
                self.room_line.append(t)
                self.waits[t] = "room"
                return
        elif what == "V" or (what == "last" and self.r[t] == 0):
            self.room += 1
            if self.room_line:
                self.wake(self.room_line.popleft())
        self.advance(t)

    def wake(self, t):
        self.waits[t] = None
        self.advance(t)  # its lock or P returns

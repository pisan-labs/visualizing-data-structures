"""A bounded buffer with a lock and two condition variables.

put waits while the buffer is full, get waits while it is empty, and each wakes the
other side. The waits sit in while loops: a woken thread does not run at once, and by
the time it has the lock again another thread may have taken the item (or the room).

Steps runs the page's program one step at a time instead (P1 puts one item, C1 and C2
take one each), so a caller can pick the interleaving. It keeps the lock and the
condition variables by hand: one test thread cannot hold a real lock for another.
"""
import threading
from collections import deque


class BoundedBuffer:
    def __init__(self, size):
        self.size = size
        self.items = deque()
        self.m = threading.Lock()
        self.room = threading.Condition(self.m)  # put waits here while full
        self.item = threading.Condition(self.m)  # get waits here while empty

    def put(self, x):
        with self.m:
            while len(self.items) == self.size:  # while, not if
                self.room.wait()  # let go of m, sleep, take m back
            self.items.append(x)
            self.item.notify()  # wake a consumer, if one sleeps

    def get(self):
        with self.m:
            while not self.items:
                self.item.wait()
            x = self.items.popleft()
            self.room.notify()  # wake the producer, if it sleeps
            return x


def run_threads(size):
    """A producer puts 1 to 6; two consumers take 3 each. Returns (sum taken, left)."""
    buf = BoundedBuffer(size)
    taken = []

    def consume():
        for _ in range(3):
            taken.append(buf.get())

    def produce():
        for x in range(1, 7):
            buf.put(x)

    threads = [threading.Thread(target=f) for f in (consume, consume, produce)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return sum(taken), len(buf.items)


class Steps:
    """P1 (t = 0) puts one item, C1 and C2 take one each. Each thread runs:
    0 lock(m)   1 t: r = n < size (P1) or n > 0 (C)   2 if r goto 5   3 wait(cv, m)
    4 goto t    5 r = n + 1 or n - 1   6 n = r   7 signal(other cv)   8 unlock(m)"""

    def __init__(self, size, start):
        self.size, self.n = size, start
        self.holder = None  # who holds m
        self.line = deque()  # waiting for m
        self.sleep = {"room": deque(), "item": deque()}  # asleep on each
        self.pc = [0, 0, 0]
        self.r = [0, 0, 0]
        self.blocked = [False] * 3

    def release(self):
        """Let go of m: hand it to the first in line, whose lock or wait returns."""
        self.holder = self.line.popleft() if self.line else None
        if self.holder is not None:
            self.blocked[self.holder] = False
            self.pc[self.holder] += 1

    def step(self, t):
        """Run thread t's next step. False if it is done or blocked."""
        if self.pc[t] == 9 or self.blocked[t]:
            return False
        producer = t == 0
        part = self.pc[t]
        if part == 0:  # lock(m)
            if self.holder is not None:
                self.line.append(t)
                self.blocked[t] = True
                return True
            self.holder = t
        elif part == 1:
            self.r[t] = int(self.n < self.size if producer else self.n > 0)
        elif part == 2 and self.r[t]:
            self.pc[t] = 5
            return True
        elif part == 3:  # wait: let go of m and sleep
            self.release()
            self.sleep["room" if producer else "item"].append(t)
            self.blocked[t] = True
            return True
        elif part == 4:  # goto t: check again
            self.pc[t] = 1
            return True
        elif part == 5:
            self.r[t] = self.n + (1 if producer else -1)
        elif part == 6:
            self.n = self.r[t]
        elif part == 7:  # signal: the woken thread must get m back first
            q = self.sleep["item" if producer else "room"]
            if q:
                self.line.append(q.popleft())
        elif part == 8:
            self.release()
        self.pc[t] += 1
        return True

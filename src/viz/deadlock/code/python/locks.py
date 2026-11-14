"""Two locks, taken in one global order, so no deadlock.

with_both is what you write with real threads: it sorts the two locks by name before
taking them, so every thread takes a before b, whatever order it asks in.

Steps runs the page's program one step at a time instead (each thread locks its two
locks in its own order, then unlocks them), keeping the locks by hand, so a caller can
pick the interleaving; find_cycle looks for a cycle in the wait-for graph.
"""
import threading
from collections import deque


def with_both(locks, x, y, work):
    """Take locks x and y in one global order (by name), run work, let go."""
    first, second = sorted((x, y))
    with locks[first]:
        with locks[second]:
            work()


def run_threads(orders, rounds=200):
    """Real threads, each asking for its two locks in its own order, all at once.
    Returns how many times the work ran: every round of every thread."""
    locks = {"a": threading.Lock(), "b": threading.Lock()}
    done = [0]

    def work():
        done[0] += 1  # safe: both locks are held

    def job(x, y):
        for _ in range(rounds):
            with_both(locks, x, y, work)

    threads = [threading.Thread(target=job, args=o) for o in orders]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return done[0]


class Steps:
    """Thread t runs lock(x), lock(y), unlock(y), unlock(x), where (x, y) = orders[t]."""

    def __init__(self, orders):
        self.orders = orders
        self.holder = {"a": None, "b": None}  # who holds each lock
        self.line = {"a": deque(), "b": deque()}  # who waits for each
        self.pc = [0] * len(orders)
        self.waits_for = [None] * len(orders)  # the lock a blocked thread waits for

    def step(self, t):
        """Run thread t's next step. False if it is done or waits for a lock."""
        if self.pc[t] == 4 or self.waits_for[t]:
            return False
        x, y = self.orders[t]
        part = self.pc[t]
        if part < 2:  # lock(x), then lock(y)
            name = x if part == 0 else y
            if self.holder[name] is not None:
                self.line[name].append(t)
                self.waits_for[t] = name
                return True
            self.holder[name] = t
        else:  # unlock(y), then unlock(x): hand it to the first in line
            name = y if part == 2 else x
            nxt = self.line[name].popleft() if self.line[name] else None
            self.holder[name] = nxt
            if nxt is not None:
                self.waits_for[nxt] = None
                self.pc[nxt] += 1  # its lock returns
        self.pc[t] += 1
        return True

    def find_cycle(self):
        """Depth-first search of the wait-for graph (t -> the holder of the lock t waits
        for), gray while on the path and black when done. Returns the first cycle, or None."""
        color = ["white"] * len(self.pc)
        path = []

        def visit(u):
            color[u] = "gray"
            path.append(u)
            lock = self.waits_for[u]
            v = self.holder[lock] if lock else None
            if v is not None and color[v] == "gray":
                return path[path.index(v):]  # an edge back to the path
            if v is not None and color[v] == "white":
                found = visit(v)
                if found:
                    return found
            color[u] = "black"
            path.pop()
            return None

        for u in range(len(self.pc)):
            if color[u] == "white":
                found = visit(u)
                if found:
                    return found
        return None

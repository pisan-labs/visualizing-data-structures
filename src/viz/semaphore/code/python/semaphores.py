"""Three semaphore patterns on real threads (the first two from The Little Book of Semaphores).

limit: a semaphore that starts at k lets at most k threads inside at once.
first: a semaphore that starts at 0 makes T2 wait for T1's signal.
turns: two semaphores make two threads take turns.

Room runs the limit pattern one step at a time instead, so a caller can pick the
interleaving. Its s goes below 0 to count the waiting threads, as the page draws it;
threading.Semaphore never goes below 0 (a thread waits instead).
"""
import threading
from collections import deque


def run_all(jobs):
    threads = [threading.Thread(target=job) for job in jobs]
    for th in threads:
        th.start()
    for th in threads:
        th.join()


def limit(k, room):
    """k threads go in and out of a room; returns the most inside at once."""
    s = threading.Semaphore(room)
    guard = threading.Lock()  # for the inside count only
    inside = most = 0

    def work():
        nonlocal inside, most
        with s:  # P(s) ... V(s)
            with guard:
                inside += 1  # in
                most = max(most, inside)
            with guard:
                inside -= 1  # out

    run_all([work] * k)
    return most


def first():
    a = threading.Semaphore(0)
    out = []

    def t1():
        out.append("one")
        a.release()  # V(a)

    def t2():
        a.acquire()  # P(a): wait for T1
        out.append("two")

    run_all([t2, t1])  # T2 starts first, and still prints second
    return out


def turns(times=2):
    a, b = threading.Semaphore(1), threading.Semaphore(0)
    out = []

    def take(mine, theirs, word):
        for _ in range(times):
            mine.acquire()  # P: wait for my turn
            out.append(word)
            theirs.release()  # V: hand the turn over

    run_all([lambda: take(b, a, "pong"), lambda: take(a, b, "ping")])
    return out


class Room:
    """3 threads, each: P(s), print("in"), print("out"), V(s)."""

    def __init__(self, room, k=3):
        self.s = room
        self.line = deque()  # threads waiting on s, first come first
        self.pc = [0] * k  # each thread's next step
        self.out = []

    def step(self, t):
        """Run thread t's next step. False if it is done or waits on s."""
        if self.pc[t] == 4 or t in self.line:
            return False
        part = self.pc[t]
        if part == 0:  # P(s)
            self.s -= 1
            if self.s < 0:
                self.line.append(t)  # wait; this thread takes no more steps
                return True
        elif part == 1:
            self.out.append("in")
        elif part == 2:
            self.out.append("out")
        else:  # V(s): wake the first waiting thread, whose P(s) returns
            self.s += 1
            if self.line:
                self.pc[self.line.popleft()] = 1
        self.pc[t] += 1
        return True

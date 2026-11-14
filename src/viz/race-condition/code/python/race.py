"""count = count + 1 is three steps: load, add, store.

Race runs the increments of several threads one step at a time, so a caller can
pick the interleaving; run_threads hands the choice to real threads instead.
"""
import copy
import threading


class Race:
    def __init__(self, threads, times):
        self.count = 0  # shared by every thread
        self.steps = 3 * times  # each thread adds 1, `times` times
        self.pc = [0] * threads  # each thread's next step
        self.reg = [0] * threads  # each thread's register

    def step(self, t):
        """Run thread t's next step. False if it has no steps left."""
        if self.pc[t] == self.steps:
            return False
        part = self.pc[t] % 3
        if part == 0:
            self.reg[t] = self.count  # load
        elif part == 1:
            self.reg[t] = self.reg[t] + 1  # add
        else:
            self.count = self.reg[t]  # store
        self.pc[t] += 1
        return True

    def run_threads(self, one_at_a_time=False):
        """Run every thread to the end on real threads. The scheduler may switch
        threads between a load and its store, so count can come out short.
        One at a time, each thread finishes before the next starts."""

        def work(t):
            while self.step(t):
                pass

        threads = [threading.Thread(target=work, args=(t,)) for t in range(len(self.pc))]
        for th in threads:
            th.start()
            if one_at_a_time:
                th.join()
        for th in threads:
            th.join()
        return self.count


def outcomes(start):
    """Every interleaving from `start`: {final count: how many schedules}."""
    found = {}

    def explore(c):
        moved = False
        for t in range(len(c.pc)):
            nxt = copy.deepcopy(c)
            if nxt.step(t):
                moved = True
                explore(nxt)
        if not moved:
            found[c.count] = found.get(c.count, 0) + 1

    explore(start)
    return found

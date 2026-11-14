"""A counter without a lock: read, compute, compare-and-swap, and retry on failure.

Python has no compare-and-swap to call, so AtomicInt makes compare_and_set atomic with
a lock inside it; Java's AtomicInteger and C++'s std::atomic do it in one instruction.
increment is the loop the page steps through.

Steps runs the page's program one step at a time instead (with the cas, or with a plain
store), so a caller can pick the interleaving.
"""
import threading


class AtomicInt:
    def __init__(self, value=0):
        self._value = value
        self._lock = threading.Lock()

    def get(self):
        return self._value

    def compare_and_set(self, expect, new):
        """If the value is still `expect`, make it `new` and return True; else False."""
        with self._lock:
            if self._value != expect:
                return False
            self._value = new
            return True


def increment(n):
    """Add 1 to n. Returns how many times the swap failed and had to be retried."""
    retries = 0
    while True:
        r = n.get()
        s = r + 1
        if n.compare_and_set(r, s):
            return retries
        retries += 1  # another thread changed n since we read it


def run_threads(k, times):
    """k real threads each add 1 to n `times` times. Returns n."""
    n = AtomicInt()

    def job():
        for _ in range(times):
            increment(n)

    threads = [threading.Thread(target=job) for _ in range(k)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return n.get()


class Steps:
    """Thread t: r = n, s = r + 1, then ok = cas(n, r, s) and a retry if it failed
    (or, with cas=False, a plain n = s)."""

    def __init__(self, k, cas=True):
        self.n, self.cas = 0, cas
        self.pc, self.r, self.s = [0] * k, [0] * k, [0] * k
        self.ok, self.retries = [0] * k, [0] * k

    def step(self, t):
        """Run thread t's next step. False if it is done."""
        k = self.pc[t]
        if k == (4 if self.cas else 3):
            return False
        if k == 0:
            self.r[t] = self.n
        elif k == 1:
            self.s[t] = self.r[t] + 1
        elif k == 2 and not self.cas:
            self.n = self.s[t]
        elif k == 2:  # compare-and-swap, as one step
            self.ok[t] = int(self.n == self.r[t])
            if self.ok[t]:
                self.n = self.s[t]
        elif not self.ok[t]:  # the swap failed: count it and read again
            self.retries[t] += 1
            self.pc[t] = 0
            return True
        self.pc[t] += 1
        return True

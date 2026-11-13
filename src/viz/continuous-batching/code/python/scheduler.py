class Request:
    def __init__(self, name, arrive, prompt, length):
        self.name, self.arrive, self.prompt, self.length = name, arrive, prompt, length
        self.start = None  # the iteration it got a slot
        self.made = 0      # tokens written so far
        self.done = None   # the time its answer is returned


class Scheduler:
    """A batch of `slots` requests, run one iteration at a time. 'continuous' fills a
    free slot at every iteration (Orca's iteration-level scheduling); 'static' starts a
    batch only when every slot is free, and returns it when its longest request is done."""

    def __init__(self, slots, policy):
        self.slots = [None] * slots
        self.policy = policy
        self.batch = []  # static: the requests of the running batch
        self.requests = []
        self.clock = 0

    def add(self, request):
        self.requests.append(request)

    def waiting(self):
        """Arrived and not started, first come first served (ties in the order added)."""
        line = [r for r in self.requests if r.start is None and r.arrive <= self.clock]
        return sorted(line, key=lambda r: r.arrive)

    def step(self):
        """One iteration. Returns who was in each slot (None when idle) and who returned."""
        t, line = self.clock, self.waiting()
        if self.policy == "continuous" or not self.batch:
            for i, r in enumerate(self.slots):
                if r is None and line:
                    r = self.slots[i] = line.pop(0)
                    r.start = t
                    if self.policy == "static":
                        self.batch.append(r)
        ran, returned = list(self.slots), []
        for i, r in enumerate(self.slots):
            if r is None:
                continue
            r.made += 1  # the first iteration reads the prompt and writes a token
            if r.made == r.length:
                self.slots[i] = None
                if self.policy == "continuous":
                    r.done = t + 1
                    returned.append(r)
        if self.batch and all(r.made == r.length for r in self.batch):
            for r in self.batch:
                r.done = t + 1
            returned, self.batch = self.batch, []
        self.clock += 1
        return ran, returned

    def busy(self):
        return any(r.done is None for r in self.requests)

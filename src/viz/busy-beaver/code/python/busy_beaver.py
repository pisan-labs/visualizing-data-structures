class BusyBeaver:
    """A Turing machine with states A, B, C, ..., a halt state H, and a tape of 0s and 1s.

    Rules come in the compact form "1RB1LB_1LA1RH": six characters per state, the rule for
    reading 0 and then the rule for reading 1. "1RB" writes 1, moves right and goes to B;
    "---" is no rule, which stops the machine without a move. The tape starts as all 0s,
    infinite both ways, and the machine starts in A.
    """

    def __init__(self, text):
        self.rules = {}  # (state, bit read) -> (bit to write, "L" or "R", next state)
        for i, part in enumerate(text.split("_")):
            state = chr(ord("A") + i)
            for bit, rule in enumerate((part[:3], part[3:])):
                if rule != "---":
                    self.rules[(state, bit)] = (int(rule[0]), rule[1], rule[2])
        self.reset()

    def reset(self):
        self.ones = set()  # the cells that hold 1; every other cell holds 0
        self.head = 0
        self.state = "A"
        self.moves = 0

    def step(self):
        """Make one move. Returns False once the machine has halted."""
        if self.state == "H":
            return False
        read = 1 if self.head in self.ones else 0
        rule = self.rules.get((self.state, read))
        if rule is None:  # no rule: stop without a move
            self.state = "H"
            return False
        write, move, self.state = rule
        if write:
            self.ones.add(self.head)
        else:
            self.ones.discard(self.head)
        self.head += 1 if move == "R" else -1
        self.moves += 1
        return True

    def run(self, tries):
        """Make up to `tries` moves, stopping early if the machine halts."""
        for _ in range(tries):
            if not self.step():
                break

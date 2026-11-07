BLANK = "_"


class MultiTapeTM:
    """A Turing machine with k tapes (Sipser 3.13), and its simulation on one tape.

    add_rule("copy", "0_", "copy", "00", "RR"): in state copy, with tape 1 reading 0 and
    tape 2 a blank, write 0 on both tapes and move both heads right. One character per
    tape; a move is L, R or S (stay). The states accept and reject halt, and a missing
    rule rejects. Every tape starts at cell 0: a head told to move left there stays put.
    """

    def __init__(self, k, start):
        self.k = k
        self.start = start
        self.delta = {}  # (state, symbols read) -> (next state, symbols to write, moves)

    def add_rule(self, state, reads, nxt, writes, moves):
        self.delta[(state, reads)] = (nxt, writes, moves)

    def run(self, words, max_moves=500):
        """Run on one word per tape. Return (accept | reject | running, moves, tapes)."""
        tapes = [list(w) for w in words] + [[] for _ in range(self.k - len(words))]
        heads = [0] * self.k
        state, moves = self.start, 0
        while state not in ("accept", "reject"):
            reads = "".join(t[h] if h < len(t) else BLANK for t, h in zip(tapes, heads))
            rule = self.delta.get((state, reads))
            if rule is None:
                state = "reject"
                break
            if moves == max_moves:
                return "running", moves, tapes
            state, writes, dirs = rule
            for i, tape in enumerate(tapes):  # every head at once
                tape.extend(BLANK * (heads[i] + 1 - len(tape)))
                tape[heads[i]] = writes[i]
                if dirs[i] == "R":
                    heads[i] += 1
                elif dirs[i] == "L":
                    heads[i] = max(0, heads[i] - 1)
            moves += 1
        return state, moves, tapes

    def simulate(self, words, max_moves=100):
        """Sipser's simulation on one tape: # w1 # w2 # ... #, a mark on each head's cell.

        Return (verdict, moves of M, moves of the single tape's head, tape, marks).
        """
        tape, marks = ["#"], []
        for i in range(self.k):
            marks.append(len(tape))
            tape += list(words[i] if i < len(words) and words[i] else BLANK) + ["#"]
        steps = 2 * (len(tape) - 1)  # one pass right to write it, one pass back
        state, moves = self.start, 0
        while state not in ("accept", "reject"):
            reads = "".join(tape[m] for m in marks)  # scan right to the last #
            rule = self.delta.get((state, reads))
            if rule is None:
                steps += len(tape) - 1
                state = "reject"
                break
            if moves == max_moves:
                return "running", moves, steps, tape, marks
            steps += len(tape) - 1
            state, writes, dirs = rule
            head = len(tape) - 1
            for i in reversed(range(self.k)):  # scan back, updating each mark
                m = marks[i]
                steps += head - m
                head = m
                tape[m] = writes[i]
                if dirs[i] == "L" and tape[m - 1] != "#":
                    marks[i] = head = m - 1
                    steps += 1
                elif dirs[i] == "R":
                    marks[i] = head = m + 1
                    steps += 1
                    if tape[m + 1] == "#":  # a new cell: shift the rest right, walk back
                        steps += 2 * (len(tape) - m - 1)
                        tape.insert(m + 1, BLANK)
                        for j in range(i + 1, self.k):
                            marks[j] += 1
            steps += head  # back to the first #
            moves += 1
        return state, moves, steps, tape, marks

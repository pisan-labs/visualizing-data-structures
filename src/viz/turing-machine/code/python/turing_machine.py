BLANK = "_"


class TuringMachine:
    """A one-tape Turing machine, as in Sipser.

    Rules look like "q0 1 -> q1 0 R" (in q0 reading 1: write 0, move right, go to q1),
    or "q1 0,y -> q1 R" to leave the symbol as it is, separated by semicolons.
    "start q0" names the start state; otherwise it is the first rule's state.
    The states accept and reject halt, and a missing rule rejects.
    The tape starts at cell 0: a move left from there leaves the head where it is.
    """

    def __init__(self, text):
        self.delta = {}  # (state, symbol) -> (next state, symbol to write, move)
        self.start = None
        for item in text.split(";"):
            words = item.split()
            if not words:
                continue
            if words[0] == "start":
                self.start = words[1]
                continue
            # state symbols -> next [write] move
            state, symbols, _arrow, nxt, *rest = words
            for a in symbols.split(","):
                write = rest[0] if len(rest) == 2 else a  # the short form keeps the symbol
                self.delta[(state, a)] = (nxt, write, rest[-1])
            if self.start is None:
                self.start = state

    def run(self, word, max_moves=500):
        """Return ("accept" | "reject" | "running", moves made, tape)."""
        tape = dict(enumerate(word))
        state, head, moves = self.start, 0, 0
        while state not in ("accept", "reject"):
            rule = self.delta.get((state, tape.get(head, BLANK)))
            if rule is None:
                state = "reject"
                break
            if moves == max_moves:
                return "running", moves, tape_text(tape)
            state, tape[head], move = rule
            if move == "R":
                head += 1
            elif move == "L":
                head = max(0, head - 1)
            moves += 1
        return state, moves, tape_text(tape)


def tape_text(tape):
    """The tape from its first to its last non-blank cell, or _ if it is blank."""
    cells = [i for i, a in tape.items() if a != BLANK]
    if not cells:
        return BLANK
    return "".join(tape.get(i, BLANK) for i in range(min(cells), max(cells) + 1))

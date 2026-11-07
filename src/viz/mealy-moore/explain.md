# Mealy and Moore machines

A DFA reads the whole word and then says yes or no. Plenty of machines can't wait that long. A traffic light, a vending machine, a circuit watching a stream of bits for 101: each one has to do something after every symbol. So we give the finite automaton an output. There are two ways to do it, named after George Mealy (1955) and Edward Moore (1956), and digital logic courses still teach both.

## The idea

Both machines have states Q, an input alphabet Σ, an output alphabet Δ, a start state q0 and moves δ(q, c). There are no accept states. The difference is where the output lives.

- A **Moore** machine writes on its states. λ(q) is what state q writes. The page draws it inside the state, the name over a line and the output under it.
- A **Mealy** machine writes on its moves. λ(q, c) is what the move from q on c writes. The arrow is labeled c/o, so `1/0` means "read 1, write 0".

| Operation | What it does | Cost |
|---|---|---|
| Run on a word of n symbols | one move and one output per symbol | Θ(n) |
| Moore to Mealy | each move writes what its target state writes | Θ(\|Q\|·\|Σ\|) |
| Mealy to Moore | split each state by the outputs on the moves into it | Θ(k·\|Σ\|), k ≤ \|Q\|·\|Δ\| |

The machine on the page is a Mealy machine that writes 1 each time the input so far ends in 101. q1 means "ends in 1" and q2 means "ends in 10". Three states. [Show me](#play:detect-101)

## Running a word

A Mealy machine reads a symbol, writes what the arrow says and moves. A Moore machine moves first and then writes what the new state says. And before it reads anything, it is already sitting in q0, so it writes λ(q0). A word of n symbols gives n output symbols from a Mealy machine and n + 1 from a Moore machine.

The output tapes sit under the input tape, cell by cell. After you press Convert, Run runs both machines at once. In [Mealy to Moore: a state splits](#example:split), the Mealy machine writes 000101 on 110101 and the Moore machine writes 0000101. Drop the Moore machine's first symbol and they agree. Every Moore symbol is one cell to the right of the Mealy symbol it matches. That is the lag: the Moore machine has to get into the state before it can write. [Show me](#play:split)

In a circuit the lag is a clock tick. A Mealy output changes as soon as the input does, in the same cycle. A Moore output changes only after the state changes, on the next one.

The 101 detector lets matches overlap: in 10101 the middle 1 ends one 101 and starts the next. [Detect 101 without overlap](#example:detect-101-once) changes one arrow, and on 110101 it writes 000100 instead of 000101. A Moore machine can do arithmetic too. [Remainder mod 3](#example:mod-3) reads a binary number from the left, and each state writes the remainder so far: 1101 is 13, and the last output is 1.

```check
Q: A Moore machine reads a word of 5 symbols. How many symbols does it write?
- 4
- 5
* 6
- It depends on the machine
= One for the start state before anything is read, then one for each state it enters: 5 + 1.
```

## Moore to Mealy

This direction is easy. A Moore machine writes λ(q) when it enters q, so give every move into q the output λ(q). Same states, same moves. The only thing lost is λ(q0) at the start, which no move writes. [Moore to Mealy keeps the states](#example:same-states) does it for a parity bit: e writes 0 (an even number of 1s so far) and o writes 1, so every move into o becomes 1 and every move into e becomes 0. [Show me](#play:same-states)

One step per move, |Q|·|Σ| of them.

## Mealy to Moore

The other direction is where states multiply. A Moore state writes one output. If the moves into a Mealy state write different things, one Moore state can't stand in for it. So:

1. For each state q, collect the outputs on the moves into q.
2. Make one copy of q for each of them: q writes the first, q' the second, and so on. A state no move enters still gets one copy.
3. Every copy of q moves like q. A move that writes o in the Mealy machine goes to the copy of its target that writes o.

The note beside each Mealy state (`in: 0,1`) lists what it is entered with. In the 101 detector, q1 is entered with 0 from q0 and q1, and with 1 from q2, so q1 splits into q1 and q1'. Four Moore states for three Mealy states. q1' is "just read 101", which is exactly the extra state you would draw if you built the Moore machine by hand.

How bad can it get? Each state splits at most |Δ| ways, so |Q|·|Δ| states. [Did the input change?](#example:change-detector) gets there: both states are entered with both outputs, and 2 states become 4. [The same parity bit as a Mealy machine](#example:no-split) is the other end: every move into o writes 1 and every move into e writes 0, so nothing splits. [Show me](#play:change-detector)

The start state is a copy of q0. Which copy? It doesn't matter for the output after the first symbol, because what the start state writes comes out before any input. The page takes the first copy. That is fine on paper. In [a vending machine](#example:vending), c0 is only ever entered by a sale, so its one copy writes 1, and the Moore machine sells you something before you put a coin in. Free snacks. Not fine in hardware.

```check
Q: In a Mealy machine, the moves into q2 write 0, 1, 0 and 1. The moves into q0 and q1 all write 0. How many states does the Moore machine get?
- 3
* 4
- 6
- 8
= q2 is entered with two different outputs, so it splits in two. q0 and q1 stay as they are: 1 + 1 + 2 = 4.
```

## There and back

**Convert back** (under More operations) converts the converted machine again. Moore to Mealy to Moore gives you the machine you started with, except maybe what a state no move enters writes. Mealy to Moore to Mealy is different. [Round trip](#example:round-trip) turns the 3-state 101 detector into a 4-state Moore machine and then into a 4-state Mealy machine. q1 and q1' now do exactly the same thing, but nothing merges them. Converting does not minimize. [Show me](#play:round-trip)

## Variants

- **The first output.** Hopcroft and Ullman count λ(q0), so a Moore machine writes n + 1 symbols. Some digital logic books start counting after the first clock tick, and then both machines write n. The **Moore output** setting switches between the two, and the pseudocode follows it.
- **Names.** Sipser's exercises call a Mealy machine a finite state transducer. Hardware people say "the outputs depend on the state" (Moore) or "on the state and the inputs" (Mealy).
- **Drawing.** Some books write a Moore state as q0/0; the page puts the name over the output. Mealy labels are always c/o.

To try your own machine, type it in the box and press Load. It is the DFA page's format with outputs added:

- Mealy: `start q0; q0 0 -> q0 / 0; q0 1 -> q1 / 1; q1 0,1 -> q0 / 0`. The `/ 0` at the end is what the move writes; `q0 0,1 -> q1 / 0` gives both moves the same output. The label form `q0 0/0,1/1 -> q1` works too.
- Moore: `start e; e / 0; o / 1; e 0 -> e; e 1 -> o; o 0 -> o; o 1 -> e`. `e / 0` says state e writes 0, and the moves have no outputs.

Every state needs a move on every input symbol, so the machine always has something to write. Up to 8 states, 4 input symbols and 4 output symbols, and a Mealy machine whose Moore machine fits in 12 states, so both drawings fit on a phone. Type a word instead (or `eps` for the empty word) and press Run.

## When to use which

Use a Moore machine when the output belongs to the situation rather than to the event: the light is green, the elevator is on floor 3. Its outputs only change on a clock tick, so they don't flicker when the input does. That is why hardware designers like it.

Use a Mealy machine when the output is a reaction: a coin went in, a 101 just finished. It reacts in the same cycle and usually needs fewer states. The price is that a glitch on the input can show up on the output.

Avoid both when the machine has to count without a bound. Balanced parentheses need a stack, and no number of states will do. And if all you want is yes or no at the end, a plain DFA is simpler.

## Common mistakes

- Comparing a Moore output with a Mealy output without dropping the first Moore symbol. They are off by one, always.
- Splitting a state by the outputs on the moves *out of* it. It's the moves *into* it that matter.
- Forgetting that the start state writes something, even on the empty word. [The empty word](#example:empty-word): the Mealy machine writes nothing, the Moore machine writes 0.
- Expecting the round trip to give you the smallest machine. It gives you an equivalent one.
- Treating the start state's output as a real output in hardware without checking it. Ask the vending machine.

```check
Q: A Mealy machine writes 0110 on a word. The Moore machine built from it starts in a state that writes 1. What does the Moore machine write on the same word?
- 0110
- 01101
* 10110
- 1011
= First the start state's output, before any input, then the Mealy output one step later: 1 then 0110.
```

## Try this

- [Detect 101 as you read](#example:detect-101): before each step, say what the machine writes. Then type `10101` and press Run. How many 1s?
- [Mealy to Moore: a state splits](#example:split): before q1's step, look at the arrows into q1. Will it split?
- [Remainder mod 3](#example:mod-3): press Convert and look at the Mealy machine's labels. Why does every move into r1 write 1?
- [Did the input change?](#example:change-detector): set **Moore output** to one symbol per input symbol and run `0110` again. What changes on the tapes?
- Load `start q0; q0 0 -> q1 / 0; q0 1 -> q1 / 1; q1 0 -> q0 / 1; q1 1 -> q0 / 0` and guess how many Moore states it needs before you press Convert.

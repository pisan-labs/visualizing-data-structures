# Union and intersection of DFAs

You have a DFA for "an even number of a's" and another for "ends in b". You want one machine for the words that do either. You could design it from scratch. Or you could run both machines at once and keep track of where each one is. That is the product construction: every state of the new machine is a pair, one state from each machine, and every symbol moves both halves. The same pairs give you the union, the intersection and the difference. Only the accept states change.

## The idea

With |A| states in A and |B| in B:

| Operation | What it does | Cost |
|---|---|---|
| Complete a DFA | a dead state takes every missing move | O(\|Q\|·\|Σ\|) |
| `PRODUCT(A, B)` | the pairs reachable from the start pair, with their moves | Θ(k·\|Σ\|), k ≤ \|A\|·\|B\| |
| Accept states | decide each pair from p ∈ F_A and q ∈ F_B | O(1) a pair |
| Complement | complete, then swap accept and non-accept | O(\|Q\|·\|Σ\|) |

The pair (p, q) means "A is in p and B is in q". Read c, and A goes to δA(p, c) while B goes to δB(q, c), so the pair goes to (δA(p, c), δB(q, c)). The start is the pair of start states. That is the whole construction, and it is Sipser's proof that the regular languages are closed under union (Theorem 1.25). [Show me](#play:union)

The drawing is a multiplication table. A runs along the top, B down the left, and the pair (p, q) sits where p's column meets q's row. The product's start arrow comes in from the corner, where the two machines meet.

## How it works

1. Complete A and B: a dead state takes every missing move.
2. Put the pair of start states in a queue.
3. Take the pair at the front. For each symbol c, both machines move on c. If that pair is new, it becomes a state and joins the queue. Either way, the product moves there on c.
4. Repeat until the queue is empty.

The page builds only the pairs it reaches, breadth first. Sipser's proof uses all |A|·|B| of them, which is simpler to write down and wasteful to draw. The faint dashed circles are pairs not built yet. Any still there at the end are pairs no word can reach. Set **Detail** to the finest level to see A's move and B's move as a step of their own.

The table is where each pair's verdict comes from: one row per pair, whether p accepts in A, whether q accepts in B, what the operation makes of the two, and where the pair goes on each symbol.

To try your own, type two machines in the box, A first, with a `|` between them, and press Load. Each machine is written as on the DFA page, such as `start p0; accept p1; p0 a -> p1; p1 a,b -> p1`, so `p0 a -> p1; accept p1 | q0 b -> q1; accept q1` is two machines. Type a word instead and press Run to run it on all three machines at once. Each machine can have up to 4 states counting its dead state, and the product up to 12 pairs, so the grid still fits on a phone.

## Which pairs accept

The pairs and their moves do not depend on the operation. Only the accept states do, and each operation is a line of a truth table:

| Operation | (p, q) accepts when |
|---|---|
| A ∪ B, union | p accepts or q accepts |
| A ∩ B, intersection | both accept |
| A − B, difference | p accepts and q does not |
| A ⊕ B, symmetric difference | exactly one accepts |

[Even a's or ends in b](#example:union) accepts at three of its four pairs. Switch **Operation** to the intersection and build again: only (p0, q1) is left, an even number of a's and a b at the end. [Exactly one count is even](#example:symmetric) is the symmetric difference of "even a's" and "even b's". [Show me](#play:symmetric)

```check
Q: A pair (p, q) of the product has p an accept state of A and q an accept state of B. For which operation does it NOT accept?
- A ∪ B
- A ∩ B
* A − B
- It accepts for all of them
= A − B wants words in A and not in B. Both halves accept, so the word is in B too.
```

## Why the dead state matters

A pair moves only when both machines can. A DFA drawn with missing moves has a hole there, so the page completes both machines before it starts.

For an intersection the hole would not hurt: once A has given up, the word is not in A ∩ B anyway. For a union it does. In [starts with a, or ends in b](#example:dead-state), A has no move from p0 on b. Read b first and A is done for, but B is not, and `bab` belongs in the union. With the dead state, A sits in dead while B keeps reading, and (dead, q1) accepts. Leave it out and the union quietly loses every word that starts and ends with b. [Show me](#play:dead-state)

Different alphabets work the same way. In [A reads only a](#example:different-alphabets), B reads a and b, so the product reads both and a b sends A to its dead state. That is the right answer: a word with a b in it is not in A.

## Empty or not

A ∩ B is empty exactly when no pair the product can reach accepts. [Even a's and odd a's](#example:empty-intersection) is the obvious case: no word has both. The grid has four pairs, and (p0, q1) would accept for the intersection, but the start pair only ever reaches (p0, q0) and (p1, q1). A pair nobody can reach does not count. [Show me](#play:empty-intersection)

The same trick checks whether two DFAs accept the same language. Build A ⊕ B: it is empty exactly when no word is in one and not the other.

## Complement

The complement needs only one machine: complete it, then swap accept and non-accept states. **Complement A** does both, a step each. The dead state then accepts, which looks odd and is right: every word that fell off A ends there, and those are exactly the words A rejects.

With complement and intersection, difference comes for free: A − B = A ∩ (not B). [Complement B, then intersect](#example:complement-as-difference) ends with the same accepting pair, (p2, q0), as [the difference](#example:difference) built directly. [Show me](#play:complement-as-difference)

## What it costs

k reachable pairs, each with |Σ| moves, each move two lookups: Θ(k·|Σ|). Every reachable state of A turns up in some pair, and so does every state of B, so k is at least the larger machine and at most |A|·|B|. [A machine with itself](#example:same-machine) reaches only the diagonal, 2 of the 4 pairs. [Divisible by 6](#example:every-pair) reaches all 6, one for each remainder mod 6.

Running the product on a word of n symbols is Θ(n), the same as running A and B side by side. [One word, three machines](#example:run-all-three) does exactly that. So for one word, you do not need the product at all. Run both machines and combine the answers. You need the product when the machine itself is what you want: to minimize it, to test it for emptiness, to combine it again, or to hand it to a lexer.

The catch is the multiplication. Ten machines of 10 states each can need 10¹⁰ pairs.

## When to use it

Use it to prove closure properties, to check that two DFAs agree (A ⊕ B is empty), to check that a system never does something bad (the system's DFA intersected with a DFA for the bad behaviour is empty), and to build one scanner out of several patterns.

Avoid it for a single word, and for many machines at once, where the pairs multiply. Model checkers build the pairs lazily, only as a search needs them. For a plain union of NFAs you do not need pairs either: a new start state with ε-moves to both starts does it with |A| + |B| + 1 states. Complement is different. Swapping accept states in an NFA does not complement it, so turn the NFA into a DFA first.

## Common mistakes

- Swapping accept states without completing the DFA first.
- Building all |A|·|B| pairs and calling the intersection non-empty because an unreachable pair accepts.
- Writing "or" when the question says "and". The pairs are the same; only F changes.
- Reading (p1, q0) and (p0, q1) as the same state. The pair is ordered: A first.
- Complementing an NFA by swapping its accept states.

```check
Q: A DFA has no move from q0 on b, and it rejects b. You swap its accept and non-accept states, without adding a dead state. What does the result do with b?
- Accepts it, as a complement should
* Rejects it too
- It depends on whether q0 accepts
= The run gets stuck on the missing move, and a stuck run rejects, in the old machine and the new one. Complete first, then swap.
```

## Try this

- [Even a's or ends in b](#example:union): before each step, say which pair comes next. Then switch to the intersection. Which pairs still accept?
- [Even a's and odd a's](#example:empty-intersection): which pairs would accept for the union? For the symmetric difference?
- [Divisible by 6](#example:every-pair): type `110` (six) and press Run, then `1000` (eight). Watch A and B disagree.
- [Starts with a, or ends in b](#example:dead-state): press **Complement A** twice, then Build. Is anything different?
- Load `p0 a -> p1; p1 a,b -> p1; accept p1 | q0 a,b -> q1; q1 a,b -> q0; accept q0` and guess how many pairs it reaches before you press Build.

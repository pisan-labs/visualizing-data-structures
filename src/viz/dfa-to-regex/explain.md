# DFA to regular expression

Going from a regular expression to an automaton is easy: glue small NFAs together. Going back is the harder direction, and it is the half of Kleene's theorem that says DFAs recognize nothing a regular expression cannot describe. Sipser's proof does it by ripping out states. Each time a state goes, the arrows around it get longer labels, so no word loses its path. When only a start and an accept state are left, the label on the one arrow between them is the answer.

## The idea

The trick is to let arrows carry regular expressions instead of single symbols. Sipser calls such a machine a generalized NFA, a GNFA. An arrow labeled `ab*` can be taken by reading any word that `ab*` matches.

With n states in the DFA:

| Operation | What it does | Cost |
|---|---|---|
| make the GNFA | add a start s and an accept f, unite parallel moves | O(n·\|Σ\|) |
| rip one state q | one new label for each arrow in and arrow out | O(n²) labels |
| `CONVERT(M)` | rip all n states, read the label from s to f | O(n³) labels |

The cost counts labels, not characters. The labels themselves grow with every rip, and that is where the real cost hides (see below). [Show me](#play:contains-b)

## How it works

First, the DFA becomes a GNFA:

1. Add a new start state s with an ε-arrow to the old start, and a new accept state f with an ε-arrow from every old accept state. Now nothing enters s, nothing leaves f, and f is the only accept state.
2. Where two moves join the same pair of states, unite them: `a,b` becomes `a∪b`. Now there is one arrow per pair.
3. A pair with no arrow has the label ∅. No word goes that way, so the page does not draw it.

Then rip out the old states, one at a time. To rip q, look at every pair (p, r) with an arrow p → q and an arrow q → r. A word could go from p to r through q: in along R1, round q's loop R2 any number of times, out along R3. Or it could skip q along the arrow R4 that is already there. So the new label is

`R1(R2)*R3 ∪ R4`

with ∅ for a missing loop or a missing arrow. Then q goes, with all its arrows. The table on the stage lists every label in full and tags R1 to R4 while a pair is rewritten. Labels on the diagram stop at 8 characters, which is about all an arrow can hold. Set **Detail** to the finest level to see the four labels read before each new one is written. [Show me](#play:contains-b)

```check
Q: Ripping q, the arrow p → q is `a`, q has a loop `b`, q → r is `c`, and p → r is `d`. What is the new label on p → r?
- `abc∪d`
* `ab*c∪d`
- `ab*c`
- `(abc)*∪d`
= In along a, round the loop any number of times (b*), out along c. Or skip q along d, which was there all along.
```

## Loops count as pairs

It is easy to look only for pairs of different states. But if p → q and q → p are both arrows, ripping q gives p a new loop: go to q, wander, come back. Divisible by 3 is full of these. In [name order](#example:div3-name-order), ripping q0 rewrites four labels: s → q1, s → f, q1 → f, and a loop on q1 for the trip q1 → q0 → q1. Miss the loop and the expression loses every word that makes that trip twice.

## The order matters

Any order works. Every order gives an expression for the same language. They are not the same expression.

[Divisible by 3 in binary](#example:div3-name-order) in name order rips q0 first. q0 has two arrows in and two out, so four new labels, and each later rip drags copies of them along. The answer has size 43 (symbols and operators), after 9 rewrites. [Fewest paths first](#example:div3-fewest) picks the state with the fewest arrows in × arrows out. q2 has one of each, so it goes first. Three rewrites later the answer is `(1(01*0)*1∪0)*`, size 10. Same DFA, same language, a quarter of the size. [Show me](#play:div3-fewest)

Fewest paths first is a heuristic. It is usually good and sometimes not the best. Finding the order that gives the shortest expression is hard, and I would not try it by hand.

## Simplifying

Written exactly as the rule gives it, a label fills up with junk. The ε-arrows from s and into f become ε's inside every label, a missing loop becomes `∅*`, and a missing direct arrow becomes `∪∅`. Sipser simplifies as he goes, with five identities:

| Identity | Why |
|---|---|
| R∅ = ∅R = ∅ | no word gets through ∅ |
| Rε = εR = R | reading nothing changes nothing |
| R ∪ ∅ = R | ∅ adds no words |
| ε* = ε | the empty word, repeated, is the empty word |
| ∅* = ε | zero repetitions is always allowed |

[Contains a b](#example:contains-b) ends in `a*b(a∪b)*`, size 7. With **Simplify** off, [the same DFA](#example:rule-as-written) ends in `(εa*b∪∅)(a∪b)*ε∪∅`, size 13. Both are right. Only one of them is something you would write on an exam. [Show me](#play:rule-as-written)

```check
Q: What is `∅*`?
- `∅`
* `ε`
- `(a∪b)*`
- It is not a valid expression
= The star allows zero repetitions, and zero repetitions of anything is the empty word. So ∅* matches exactly one word, ε.
```

## Dead states and empty languages

A dead state has no arrow out to another state, so no path through it ever reaches f. In [starts with ab](#example:dead-state), name order keeps the dead state q3 until last. Along the way it collects the labels `b`, then `aa∪b`, from s. Then its turn comes, nothing leaves it, and all that work is deleted. Fewest paths first rips it at once, since zero paths go through it. [Show me](#play:dead-state)

When the DFA has no accept state, no arrow ever enters f. The rips still happen, but there is never an arrow from s to f, so the answer is ∅, the expression for the empty language. [No accept state](#example:accepts-nothing) shows it. And when the start state accepts, as in [an even number of a's](#example:even-as), the answer has to match ε: here it is `(ab*a∪b)*`, and the star takes care of it.

## What it costs

Ripping the k-th state rewrites at most (n − k + 1)² labels, so about n³ rewrites in all. That part is polynomial.

The labels are not. Each rip can copy R1, R2 and R3 into several new labels, so the expression can double with each state. For some DFAs every regular expression is exponentially longer than the DFA, whatever the order. A DFA with 6 states can produce an expression of a few hundred symbols, and a DFA with 20 states can produce one nobody will ever read. This page stops at 6 states, and refuses a DFA whose labels would grow past 300 characters.

## When to use it

Use it when you need the expression: to prove that a language is regular in the regular-expression sense, to hand a pattern to a tool that only takes expressions, or to check an expression you wrote for a DFA by hand. It is also the proof Sipser gives, and I think the easiest one to follow.

Avoid it for big DFAs. The expression gets long fast, and a long expression is no easier to understand than the DFA you started from. If what you need is a matcher, keep the DFA: it already runs in Θ(m) for a word of length m. Minimize first ([DFA minimization](/dfa-minimization/)); fewer states means fewer rips. Hopcroft, Motwani and Ullman also give the `R_ij^(k)` construction, which builds the same kind of answer as ripping the states in a fixed order.

## Common mistakes

- Forgetting R4. The old arrow p → r is still a way to go, so it stays in the union.
- Writing R2 instead of (R2)*. The loop can be taken any number of times, including zero.
- Skipping the pairs where p = r. Those are the new loops.
- Forgetting s and f. Without them, the start state may have arrows coming in, and ripping it breaks things.
- Simplifying R∅ to R. It is ∅: a path that needs ∅ goes nowhere.
- Expecting one right answer. Two correct expressions can look nothing alike; test them on a few words instead.

## Try this

- [Contains a b](#example:contains-b): before each rip, say what the new label will be.
- [Divisible by 3, name order](#example:div3-name-order): switch **Rip states in** to fewest paths first and convert again. Which state goes first, and why?
- [Starts with ab](#example:dead-state): count the rewrites that end up deleted.
- Load `start q0; accept q0; q0 a -> q1; q1 b -> q0`. What will the answer be? Press Convert and check.
- Fill with **Count a's** at size 5 and convert in both orders. How much shorter is fewest paths first?

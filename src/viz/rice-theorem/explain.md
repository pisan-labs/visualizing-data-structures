# Rice's theorem

Wouldn't it be nice to have a tool that reads your program and tells you whether it ever prints "hello"? Or whether it accepts the empty input? Or whether it is equivalent to the reference solution? Rice's theorem says: forget it. **Every non-trivial property of what a program does is undecidable.**

More carefully: let P be a property of languages (the set of inputs a machine accepts). If some machines' languages have P and some don't, then no program decides, given ⟨M⟩, whether L(M) has P.

| Operation | What it does | Cost |
|---|---|---|
| **Build M′** from M and w | Writes the machine of the proof: run M on w, then behave like M_P | O(\|M\| + \|w\|), and it never runs anything |
| **Test** x | Runs M′ on an input, phase by phase | loops forever if M loops on w |
| **Decide** | Walks through the argument: a decider for P would decide halting | impossible, which is the point |

## The proof, as a program

The proof is a reduction from the [halting problem](/halting-problem/). Suppose R decides P. Pick a machine M_P whose language has P (one exists, since P is non-trivial), and assume the empty language does not have P (if it does, use the complement of P instead).

Given any M and w, build this machine:

> **M′ on input x:** run M on w, ignoring x. If that halts, run M_P on x and do what it does.

Now look at L(M′):
- if M halts on w, M′ always gets to the second line, so L(M′) = L(M_P), which has P;
- if M loops on w, M′ never gets there, so L(M′) = ∅, which doesn't.

So R(⟨M′⟩) says yes exactly when M halts on w. Building M′ is just writing code, which always finishes. Put the two together and you have a program that decides HALT. There isn't one. So R can't exist.

[M halts on w, so M′ has the property](#example:halts-has-p) builds M′ from M3 and ⟨M2⟩ and tests a couple of inputs. [Show me](#play:halts-has-p) Then compare [M loops on w, so L(M′) is empty](#example:loops-lacks-p), and step through [The whole argument, step by step](#example:the-argument).

```check
Q: M loops on w. What is L(M′)?
- L(M_P)
* ∅: M′ loops on every input
- It depends on the input x
= Line 1 never finishes, whatever x is, so M′ never accepts anything.
```

## Wait, the page decides it

It does, and that's not a contradiction. The programs here are the toy programs from the halting-problem page: they read their input but never write. A program like that has only so many (line, head) configurations, so it either halts or repeats one, and the page can check which. That's how it knows what M′ does.

Real Turing machines write on an unbounded tape and can run forever without repeating. No cycle check works for them, and the argument above shows no other check does either. The toy world is a model of the proof, not a counterexample.

## Semantic or not?

Rice only talks about **semantic** properties: properties of the language, so two machines that accept the same inputs always agree on them. And only **non-trivial** ones: some machines have the property, some don't.

| Property | Rice applies? |
|---|---|
| L(M) contains A | yes: undecidable |
| L(M) is empty / finite / regular | yes: undecidable |
| M accepts every input | yes: undecidable |
| M has 5 states (or 5 lines) | no: it's about the code. Count them. |
| M moves its head within 10 steps on input A | no: run it for 10 steps |
| L(M) is recognizable | no: trivial, every L(M) is |

The syntactic ones are easy to decide because you can answer by reading the code, or by running it for a bounded number of steps. The trivial ones are decidable by a program that always says yes (or always no). Rice doesn't forbid either.

```check
Q: Which of these is decidable?
- Does M accept the empty word?
- Is L(M) infinite?
* Does M's code contain more than 10 states?
= The last one is about the code, not the language. The other two are semantic and non-trivial, so Rice says no.
```

The settings let you pick other properties: [Another property: does M accept ε?](#example:empty-word) and [Is the language empty? Undecidable too](#example:nonempty). The machine M′ is the same each time; only M_P changes.

## What it means in practice

Every static analysis tool lives with Rice. "Does this program ever divide by zero?", "is this variable ever null?", "does this function terminate?" are all semantic. So tools either answer about the code instead (type systems, linters), answer for bounded runs (testing, bounded model checking), or approximate: they say "maybe" sometimes, and are right when they say "never". Your compiler's warning that a variable "may be used uninitialized" is exactly that compromise.

It also explains why autograders run tests instead of proving your code correct. Equivalence to the reference solution is semantic.

## Common mistakes

- **Applying Rice to syntactic properties.** "Has a loop" or "has 5 states" is about the code: decidable.
- **Forgetting non-trivial.** A property every machine has, or none has, is decidable by a constant answer.
- **Running M′ to build it.** The reduction only writes M′. If building it ran M on w, the reduction itself might loop.
- **Thinking undecidable means unanswerable for every M.** For many specific programs you can answer. What's impossible is one program that answers for all of them.
- **The ∅ case.** If the empty language has P, the construction gives the wrong direction. Use the complement of P, which is just as undecidable.

## Try this

- Build M′ from M2 and any w. Test three inputs. Why do they all loop?
- Build M′ from M1 and ⟨M6⟩ with P = "L(M) contains the empty word". Which inputs does M′ accept?
- Is "M halts on every input" a semantic property? Is it decidable?
- Find a property of programs that is semantic but trivial. (Hint: think about what every language is.)

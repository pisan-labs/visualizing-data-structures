# 2-SAT

You have some true/false variables and a list of clauses. Each clause is an "or" of at most two literals, where a literal is a variable or its negation: (a ∨ ¬b) says "a is true, or b is false, or both". Can you pick values so that every clause is true at once?

With three literals per clause this is 3-SAT, the original NP-complete problem, and nobody knows a fast algorithm. With two it collapses to a graph search that runs in linear time. I find that gap one of the stranger facts in computer science.

| Step | What it does | Cost |
|---|---|---|
| Build the implication graph | 2n vertices, two arcs per clause | Θ(n + m) |
| Strongly connected components | Kosaraju or Tarjan | Θ(n + m) |
| Check and assign | One pass over the variables | Θ(n) |

## Clauses are implications

(a ∨ b) can be read two ways. If a is false, b had better be true. If b is false, a had better be true. So each clause gives two arcs:

¬a → b and ¬b → a

Make a vertex for every literal (x and ¬x for each variable x) and add both arcs for every clause. That's the implication graph. A path from p to q means "if p is true, q has to be true too". A single literal, such as a on its own, is (a ∨ a) and gives one arc, ¬a → a.

Notice the symmetry: whenever p → q is an arc, so is ¬q → ¬p (the contrapositive). The graph is its own mirror image.

```check
Q: Which arcs does the clause (¬a ∨ c) add?
- ¬a → c and ¬c → a
* a → c and ¬c → ¬a
- a → ¬c and c → ¬a
= If ¬a is false (a is true) then c must be true, and if c is false then ¬a must be true.
```

## When is it impossible?

Suppose x and ¬x are in the same strongly connected component. Then there's a path from x to ¬x and one from ¬x to x. Setting x true forces x false, and setting x false forces x true. No assignment can work, and the formula is unsatisfiable. [Show me](#play:contradiction)

The surprising part is the converse. If no variable shares a component with its negation, an assignment always exists, and we can read it straight off the components.

## Reading off an assignment

Condense the graph: one vertex per component. That graph is a DAG, so it has a topological order. Then the rule is:

x = TRUE exactly when x's component comes after ¬x's component in topological order.

Why does that work? Think of it as walking the components from the end of the order back to the start (sinks first) and making every literal you meet true, if its variable has no value yet. A sink has no arcs out, so making its literals true never forces anything else. By the mirror symmetry, the negations of those literals sit in a source-like position and get made false, which never violates anything either: an arc out of a false literal promises nothing.

Kosaraju's algorithm happens to find the components in topological order, and Tarjan's finds them in reverse topological order. The **Components by** option switches. Same rule, read in the other direction. [Show me](#play:three-clauses-tarjan)

```check
Q: Kosaraju numbers the components 1, 2, 3, ... in topological order. b is in component 2 and ¬b is in component 5. What value does b get?
- TRUE
* FALSE
- The formula is unsatisfiable
= ¬b's component comes later, so ¬b is made true and b = FALSE.
```

## When to use it

More problems are 2-SAT in disguise than you'd expect. Each constraint has to say "at least one of these two things". Scheduling with "this meeting is in the morning or that one is in the afternoon". Placing labels on a map, each with two candidate spots, so that no two overlap. Assigning each team in a tournament to home or away under pairwise rules. If a constraint needs three options, you're out of luck: that's 3-SAT.

## Failure cases and common mistakes

- Adding only one arc per clause. You need both ¬a → b and ¬b → a, or the mirror symmetry breaks and the answer can be wrong.
- Reading the topological order the wrong way round. With Kosaraju the later component wins; with Tarjan's numbering the earlier one does.
- Checking x and ¬x for a path in one direction only. A path from x to ¬x just means x must be false ([a chain of implications](#example:chain)). Only a path both ways is a contradiction.
- Forgetting single-literal clauses. [Single literals](#example:forced) shows how a turns into ¬a → a.
- Trying 2-SAT tricks on clauses with three literals. They don't transfer.

## Try this

- [Three clauses](#example:three-clauses). Before solving, find a satisfying assignment by hand. Does the algorithm pick the same one?
- [Three clauses, with Tarjan](#example:three-clauses-tarjan). Same formula. Do the values change?
- [A chain of implications](#example:chain). Follow the path from a to ¬a and explain why a must be false.
- [Every combination ruled out](#example:contradiction). Find the cycle through a and ¬a.
- [Single literals](#example:forced).
- Type your own clauses, such as `a | b, !a | c, !b | !c`, press **Load**, and predict the answer before pressing **Solve**.

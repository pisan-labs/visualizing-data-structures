# Post correspondence problem

You get a pile of dominoes. Each has a string on top and a string on the bottom, and you can use as many copies of each as you like. Can you line some up so the tops, read left to right, spell exactly the same string as the bottoms? That sequence is a **match**. Emil Post posed the puzzle in 1946, and it looks like something from a newspaper puzzle page. It is undecidable: no program can answer it for every pile of dominoes.

| Operation | What it does | Cost |
|---|---|---|
| **Load** | reads dominoes typed as top/bottom, such as `b/ca a/ab ca/a abc/c` | O(n) |
| **Try** | lays down the dominoes you number, one at a time, until the strings disagree | O(L), L the symbols laid down |
| **Search** | looks for a match of at most **Bound** dominoes, breadth first or depth first | up to O(nᵇ) for n dominoes and bound b |

## The puzzle

The page starts with four dominoes: b over ca, a over ab, ca over a, abc over c. Try `2 1 3 2 4`. The tops spell a·b·ca·a·abc and the bottoms ab·ca·a·ab·c, and both are abcaaabc. That's a match. [Check a sequence by hand](#example:try-a-match) also tries 2 3, which goes wrong in the second column, and 1, which goes wrong right away: b over ca disagrees with itself. [Show me](#play:try-a-match)

Notice what happens along the way. After 2 1 the top is ab and the bottom is abca. They agree as far as both go, and the bottom is ahead by ca. That leftover is the **overhang**. A sequence like that is a **partial match**: still alive, because more dominoes might catch the top up. Once the two strings disagree anywhere, the partial match is dead. Nothing you add on the right can fix a mistake on the left.

## Searching for a match

Search does what you would do with a pencil, only more patiently. It starts from the empty sequence, adds each domino in turn, throws away the dead ones and keeps the live ones on a queue. [A match of five dominoes](#example:short-match) finds 2 1 3 2 4, and almost every branch dies on its first or second domino. Breadth first tries every sequence of one domino, then of two, and so on, so the first match it finds is a shortest one. [Show me](#play:short-match)

Depth first keeps a stack instead. It always extends the newest partial match and backs up only when a branch dies. It uses less memory, but the first match it finds may be long. In [depth first finds a match, not the shortest](#example:depth-first) it finds a six-domino match where breadth first finds one of three. [Show me](#play:depth-first)

The **Bound** keeps the search finite. A partial match that reaches the bound is cut off. Cut off is not dead: it might still grow into a match. [A shortest match of 12 dominoes](#example:long-match) needs the bound at 12, and then breadth first gets there after extending only 17 partial matches. Put the bound back to 6 and you get [a match exists, but not within the bound](#example:long-match-cut): no match up to 6, one partial match cut off, and the right conclusion is "I don't know". [Show me](#play:long-match)

```check
Q: Search with the bound at 6 ends with "no match up to 6, 1 cut off". What do you know?
- The dominoes have no match
* No match uses 6 dominoes or fewer; a longer one may exist
- A match exists, of 7 dominoes
= A cut-off partial match was still alive. It might grow into a match of 12 dominoes, or never match at all. The search only looked as far as the bound.
```

## When a search proves there is no match

Sometimes the queue runs dry. In [every branch dies: no match at all](#example:all-die), abc over ab is the only domino that can start, and every domino after it disagrees. Nothing was cut off, so nothing was left unexplored: there is no match of any length. [Show me](#play:all-die)

The overhang is all that matters about a partial match. Two partial matches with the same overhang have exactly the same futures, so if you've seen an overhang before, you can skip it. Turn on **Skip a partial match whose overhang was seen before** and look at [the same overhang again](#example:same-overhang): a over ab leaves the bottom one b ahead, ba over ab leaves it one b ahead again, and the search stops with a proof. With the skipping off, the same search walks one b ahead forever until the bound cuts it off. [Show me](#play:same-overhang)

## When it can't

[Every top is longer](#example:top-runs-ahead): aa over a and ab over b. Every domino adds more on top than below, so the top string is always longer, and the two can never end together. No match. You can see that in one line. The search can't: one branch stays alive with a growing overhang, the overhangs never repeat, and the bound cuts it off.

That's the whole problem in miniature. If a match exists, an unbounded breadth-first search finds it eventually, so PCP is recognizable. If no match exists, the search may run forever, and no cleverer program fixes that for every instance.

## Why no program can decide it

The proof is a reduction from the [halting problem](/halting-problem/), or more exactly from A_TM, whether a Turing machine M accepts a word w. From M and w you build dominoes whose only matches spell out an accepting run of M on w:

- the first domino puts the start configuration on the bottom, `#` over `#q₀w#`, so the bottom starts one configuration ahead;
- each later domino copies a tape symbol (a over a), or applies one of M's rules to the few cells around the head;
- so the only way to keep the top catching up is to write the next configuration on the bottom, then the next;
- the top can only catch up for good once the run reaches the accept state, where extra dominoes eat the tape away.

So the dominoes have a match exactly when M accepts w. Building them is easy and always finishes. If a program decided PCP, it would decide A_TM, and none does.

That construction needs the match to start with the first domino, which is the **modified PCP**. Sipser proves the modified problem undecidable first and then turns any modified instance into a plain one with a trick that forces the start. Switch **Problem** in Options to see the difference: [modified PCP, start with domino 1](#example:must-start-first) has no match, though the same dominoes have one when any domino may start.

[Rice's theorem](/rice-theorem/) reaches undecidability by a reduction too. PCP is the usual next step after it, because it has nothing to do with machines, and that makes it handy for proving other problems undecidable.

```check
Q: The reduction builds dominoes from a machine M and a word w. When do the dominoes have a match?
- When M halts on w
* When M accepts w
- When M rejects w
= The only matches spell out an accepting run of M on w, from the start configuration to the accept state.
```

## When to use it

Nobody solves PCP for a living. You use it to show that something else can't be solved. Reduce PCP to your problem and your problem is undecidable too. The classics are about context-free grammars: whether a grammar is ambiguous, and whether two grammars generate a common string, both follow from PCP in a page or so.

The search itself is a fine example of bounded search with pruning: breadth first for the shortest answer, depth first for memory, a bound to stop, and a memo of states (here, overhangs) that turns some endless searches into proofs.

How small can an undecidable PCP be? With 5 dominoes it is already undecidable. With 2 it is decidable. Nobody knows about 3 or 4.

## Common mistakes

- **Reading "no match up to the bound" as "no match".** Cut off is not dead.
- **Thinking a domino can be used only once.** Repeats are allowed; most matches need them.
- **Forgetting that one string may run ahead.** A partial match is alive while one string is a prefix of the other. They don't have to be the same length until the end.
- **Thinking undecidable means every instance is hard.** Many instances are easy, as the dead-at-once and every-top-longer examples show. Undecidable means no single program handles all of them.
- **Mixing up PCP and modified PCP.** The modified problem fixes the first domino, and the same dominoes can have a match in one and not the other.

## Try this

- [A match of five dominoes](#example:short-match): before you search, find the match yourself with Try. Which domino must come first, and why?
- [A shortest match of 12 dominoes](#example:long-match): switch Search to depth first. Does it find a match within the bound of 12?
- Load `a/baa ab/aa bba/bb` and press Search. Then put the bound at 3. What changes, and what does the search say?
- Fill with **Every top longer than its bottom** a few times. Is there ever a match?
- [The same overhang again](#example:same-overhang): turn the skipping off and search again. How many partial matches are cut off?

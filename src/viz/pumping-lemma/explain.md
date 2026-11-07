# The pumping lemma game

You want to show that aⁿbⁿ is not regular. You can't try every DFA, there are infinitely many. So you argue about all of them at once: any DFA for aⁿbⁿ would have some number of states, p, and a long enough string has to loop somewhere in the first p of them. The pumping lemma packages that argument, and the cleanest way I know to use it is as a game. The adversary claims L is regular. You try to catch it out.

## The idea

Sipser's Theorem 1.70: if L is regular, there is a number p (the pumping length) such that every string s in L with |s| ≥ p can be split into three pieces, s = xyz, with

1. xyⁱz ∈ L for every i ≥ 0,
2. |y| ≥ 1, and
3. |xy| ≤ p.

Read the quantifiers as moves:

| Move | Who | Why it is theirs |
|---|---|---|
| Pick p | the adversary | "there is a p" |
| Pick s in L with \|s\| ≥ p | you | "every s" |
| Split s = xyz with \|xy\| ≤ p, \|y\| ≥ 1 | the adversary | "can be split" |
| Pick i ≥ 0 | you | "for every i" |

You win if xyⁱz is not in L. If you can win whatever the adversary does, no p works, so L is not regular. Here is the textbook win: [aᵖbᵖ beats every split](#example:winning-string). [Show me](#play:winning-string)

The page plays the adversary, and it plays it properly:

| Operation | What it does | Cost |
|---|---|---|
| **Language** L | starts a game; the adversary picks p (the **Pumping length** option) | O(1) |
| **String** s | checks s is in L and at least p long, then tries every legal split | Θ(p²·n) |
| **Pump** i | builds xyⁱz and checks it | Θ(n + i·\|y\|) |

Every split gets pumped with i = 0 to 5. If some split stays in L for all six, the adversary takes it and you cannot win. If none does, it takes the one that holds out longest, and you still have to find the i that breaks it. The **i** row under the drawing keeps score for the split in play.

## How the page plays

Type a language and press **Language**: `anbn`, `paren` (balanced parentheses), `wwr`, `ww`, `anbncn`, `squares`, `primes`, `(ab)*` or `a*b*`. Then type a string such as `aaaabbbb` and press **String**, then a number and press **Pump**.

In the drawing, each piece gets a bar and a color: x blue, y orange, z green. The arrow under s marks the first p symbols, the only place x and y are allowed to be. The pumped string sits underneath, each cell sliding down from the piece it came from, so you can count the copies of y. Set **Detail** to every detail to watch the adversary try the splits one at a time.

i stops at 5 so the pumped string fits on a phone. The lemma allows any i, and a real proof can use any i. For every language on this page, 0 to 5 turns out to be enough, but I'd still check your proof does not secretly need i = 5000.

## One win is not a proof

Beat one split and you have won one game. That on its own proves nothing. The adversary picked one split out of many, and a proof has to beat all of them.

What the page does is the next best thing. The adversary tried all 10 legal splits of a⁴b⁴ and none of them survived, so a⁴b⁴ beats every split for p = 4. Still not a proof. The adversary could have picked p = 5, or 500. A proof is an argument that works for every p, and for aⁿbⁿ it is one sentence: with s = aᵖbᵖ, |xy| ≤ p puts y inside the a's, so xy²z has more a's than b's. Change **Pumping length** and play again. The string changes. The sentence doesn't.

```check
Q: You play s = a⁴b⁴ against p = 4, the adversary splits it as x = ε, y = a, z = a³b⁴, and you win with i = 2. What have you shown?
- aⁿbⁿ is not regular
- aⁿbⁿ is regular
* This split loses to i = 2, and nothing more
= One game is one split. The proof needs every split, and every p. Here the adversary did try all 10 splits for p = 4, and that still leaves every other p.
```

## Regular languages always pump

On a regular language the adversary always has a split that survives. [(ab)*: the adversary always survives](#example:regular-pumps) takes y = ab, and every pumped string is still ab repeated. No i wins. [Show me](#play:regular-pumps)

[a*b* looks like aⁿbⁿ, but pumps](#example:looks-like-anbn) is the one that catches people. Same string, a⁴b⁴, same splits, but nothing has to match, so y = a pumps forever. Counting is what makes aⁿbⁿ hard.

The lemma only works one way. If L is regular, it pumps. If L pumps, you know nothing: some languages that are not regular pump anyway (Sipser has one, aⁱbʲcᵏ where i = 1 forces j = k). To show a language is regular, build the DFA, or a regular expression. Losing the game proves nothing either.

## Picking s

Most of the work in a proof is picking s. Two rules.

s has to be at least p long. The lemma promises nothing about shorter strings, so the page refuses them: [A string shorter than p](#example:too-short). That also means s has to depend on p. Pick s = a⁵b⁵ and the adversary picks p = 6, and you are out of the game.

s should leave the adversary no room. [A string the adversary can pump](#example:easy-string) plays ()()()() against balanced parentheses. It is balanced, it is long enough, and y = () pumps forever. (⁴)⁴ fixes it: the first p symbols are all open parentheses, so y is too. [Show me](#play:easy-string)

The trick is usually the same: put something boring in the first p symbols (all a's) and the thing that has to match after it. Then |xy| ≤ p does your case analysis for you.

## The other side: you defend

Set **Your role** to defend and you are the adversary. You pick p (the option), the page picks s, and you type a split such as `aa|a|abbbbbb` (or just the lengths of x and y, `2 1`) and press **Split**. The page tries i = 0, 2, 3, 4 and 5 and stops at the first one that pumps s out of L.

[Defending aⁿbⁿ: every split loses](#example:defend-loses). Whatever you do, y is in the a's. [Defending (ab)*: y = ab survives](#example:defend-regular) is the happier story. [Show me](#play:defend-regular)

Playing the adversary for a few rounds is the fastest way I know to understand why the conditions are there. Try a split with |xy| > p, or y empty, and the page tells you which rule you broke.

## The context-free lemma

Context-free languages pump too, but two pieces at once. Sipser's Theorem 2.34: if L is context-free, there is a p such that every s in L with |s| ≥ p splits as s = uvxyz with

1. uvⁱxyⁱz ∈ L for every i ≥ 0,
2. |vy| ≥ 1, and
3. |vxy| ≤ p.

The two pieces come from a variable that repeats on a long path of the parse tree: the bigger subtree can be pasted where the smaller one was, as many times as you like. Set **Lemma** to context-free and the page plays this game.

aⁿbⁿ now pumps. [aⁿbⁿ pumps with the context-free lemma](#example:anbn-pumps-both-sides): v = a and y = b, right at the middle, go up and down together. [Show me](#play:anbn-pumps-both-sides)

aⁿbⁿcⁿ does not. [aⁿbⁿcⁿ is not context-free](#example:abc-context-free): vxy is at most p long, so it cannot reach both the a's and the c's of aᵖbᵖcᵖ. Pumping changes one or two counts and leaves the third behind.

[ww: aᵖbᵖaᵖbᵖ beats every split](#example:ww-context-free) is the hard one, and the page has 169 splits to try for p = 3. The proof needs cases: vxy inside the first half, inside the second, or across the middle. Notice that vxy can sit anywhere now, so the "boring first p symbols" trick stops working.

```check
Q: Why can't the context-free lemma prove aⁿbⁿ is not context-free?
- The adversary picks a p larger than the string
* v = a and y = b, next to each other, pump together and keep the counts equal
- y can be empty
= The lemma only works one way, and aⁿbⁿ is context-free: S → aSb | ε. Any split with v in the a's, y in the b's and |v| = |y| survives every i.
```

## Squares and primes

Unary languages are all about lengths. [a^(n²): the gaps between squares](#example:squares): with s = a^(p²), pumping adds between 1 and p symbols, and the next square is 2p + 1 away. xy²z lands in the gap.

[aⁿ, n prime](#example:primes) is sneakier. The adversary's split survives i = 0 and i = 2, since 3, 7 and 11 are all prime. i = 3 gives 15. The textbook proof takes s = a^q for a prime q and i = q + 1, so |xyⁱz| = q(1 + |y|), never prime. That i is past this page's limit of 5, but some smaller one always works here.

## When to use it

Use the pumping lemma to show a language is not regular, or not context-free, when one long string has an obvious "this part has to match that part" structure.

Avoid it when something shorter works. Closure properties often are: if L were regular, so would be L ∩ a*b*, and if that is aⁿbⁿ, you are done. The Myhill–Nerode theorem gives an exact test for regularity, and it can be easier than the lemma. And never use the lemma to show a language is regular. It can't.

## Common mistakes

- **Choosing the split yourself.** The adversary chooses it. [You don't get to choose the split](#example:choose-the-split) shows what happens when you press Split in the prover's role.
- **Picking s too short**, or picking a fixed s like a⁵b⁵ that does not grow with p.
- **Thinking a won game is a proof.** Your win beats one split. The adversary's win proves nothing about regularity at all.
- **Forgetting |xy| ≤ p**, and arguing about a y in the middle of the string. That is the context-free lemma, and its y comes with a v.
- **Only trying i = 2.** Pumping down, i = 0, is often the one that works.
- **Using the regular lemma on a context-free language** and calling it done. aⁿbⁿ is not regular and is context-free: use the right lemma for the claim.

## Try this

- [aᵖbᵖ beats every split](#example:winning-string): change **Pumping length** to 2, then 5. Same win? Same argument?
- Load `wwr` and try `aabbaa`, then `aaaabbaaaa`. Which one gives the adversary room?
- Load `ww` and try `aaaaaaaa`. Why does y = aa survive?
- [Defending (ab)*](#example:defend-regular): find every surviving split. How many are there?
- Switch to the context-free lemma and play `anbn` with `aaabbb`. Where does the adversary put v and y?
- [aⁿ, n prime](#example:primes): set p = 5 and play `aaaaaaa`. Which i wins now?

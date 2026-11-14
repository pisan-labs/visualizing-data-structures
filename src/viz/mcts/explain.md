# Monte Carlo tree search

Some trees are too big to search. Go has about 250 moves per position and games of about 150 moves, so trying everything is out. Monte Carlo tree search (MCTS) does something cheaper. Play a move, finish the game at random, see who won. Do that many times, and put more of the tries into the moves that keep winning. The tree grows where the good moves are, and the rest stays a sketch.

The tree on this page is tiny. A model has written "the", and three words can come next. Each has two words after it, and each of those two endings: twelve sentences in all. A reward model (a table made by hand) scores each finished sentence from 0 to 1. The search does not see the scores. It only finds out when a random rollout lands on one.

## The idea

| Phase | What it does | Cost |
|---|---|---|
| selection | from the root, while every child is in the tree, go to the child with the largest UCB1 = Q + c·√(ln N / n) | Θ(b) per level |
| expansion | add one child that is not in the tree yet | Θ(1) |
| rollout | from there, pick children at random until the sentence ends; its score is r | Θ(d) |
| backpropagation | every node on the path gets n += 1 and W += r | Θ(d) |
| move | after the budget, the child of the root with the most visits | Θ(b) |

Here n is a node's visits, W its total reward and Q = W / n its mean; N is the parent's visits; b is the number of children and d the depth (3 here). One round of the four phases is an iteration. [Show me](#play:budget-30)

## How it works

Start with [The first rounds try each word once](#example:first-rounds). The root has three words it has not tried, so selection stops at once and expansion adds cat. The rollout picks at random, a u from the seeded random numbers for each choice: u = 0.52 picks ran, u = 0.03 picks off. "the cat ran off" scores 0.5. Backpropagation gives the root and cat one visit and 0.5 each. Iterations 2 and 3 do the same for dog (0.1) and fox (0.1).

Iteration 4 is the first real choice. N = 3, and each child has n = 1. cat scores 0.50 + √2 × √(ln 3 / 1) = 1.98, dog and fox 1.58. Selection goes to cat, expansion adds sat, the rollout ends at "the cat sat down" (0.6), and cat now has Q = 1.1 / 2 = 0.55.

Iteration 5 is the interesting one. cat has the better mean, 0.55 against 0.10. But cat has 2 visits and dog only 1, so dog's bonus is bigger: cat 0.55 + √2 × √(ln 4 / 2) = 1.73, dog 0.10 + √2 × √(ln 4 / 1) = 1.77, and fox the same. Dog wins the tie by coming first. A word with a poor first try still gets another look.

```check
Q: A child has Q = 0.5 and n = 4 visits, and its parent has N = 16. With c = √2, what is its UCB1 score?
* 1.68
- 0.50
- 1.18
- 2.27
= ln 16 = 2.77, divided by 4 is 0.69, and its square root is 0.83. Times √2 that is 1.18, plus the mean 0.5 gives 1.68.
```

## Exploring and exploiting

UCB1 comes from the multi-armed bandit problem: a row of slot machines, each paying out at its own unknown rate, and you want to win as much as you can. Auer, Cesa-Bianchi and Fischer (2002) gave the rule: play the machine with the best mean plus √(2 ln N / n). The bonus grows slowly with the total plays N and shrinks with this machine's plays n, so a machine nobody has tried in a while gets tried again. Kocsis and Szepesvári (2006) used the rule at every node of a tree and called it UCT. Coulom (2006) had named the search Monte Carlo tree search the same year. With c = √2, the c·√(ln N / n) on this page is exactly that bonus.

c sets the balance. [No exploring: c = 0 locks on](#example:no-exploration) takes the best mean and nothing else. Dog's one rollout scored 0.2, so dog is never tried again. Cat gets 28 of the 30 visits, and the search never learns that "the dog ran home" scores 1. [A bigger c spreads the visits](#example:big-c): with c = 2, after 100 iterations, the visits are dog 48, cat 36, fox 16. The right answer still wins, by less.

## More iterations, a different answer

The mean at a node is the average of random rollouts below it. That is a fair estimate of how good the node is if you finish at random, and an unfair one if you finish well. Dog's four sentences score 0.1, 0.2, 0.2 and 1.0: a mean of 0.375 at random, and 1.0 if you pick right. Cat's are all around 0.6.

So in [30 iterations pick the safe word](#example:budget-30), cat wins: 13 visits (mean 0.60) against dog's 11 (0.55). The search has found "the dog ran home" by then, 5 times. But dog's other 6 visits scored 0.1 or 0.2, and they still hold its mean below cat's. In [100 iterations find the dog that ran home](#example:budget-100) that is no longer true. Selection keeps choosing "dog ran" and "dog ran home", the rollouts keep scoring 1, and dog's mean climbs to 0.82. Dog gets 63 visits, 55 of them through ran. Kocsis and Szepesvári proved this in general: with enough iterations, the chance that UCT picks a wrong move at the root goes to 0.

```check
Q: Why is the move the most visited child, and not the child with the best mean?
* The visits show where the search kept looking; a high mean on a few visits can be luck
- The most visited child always has the best mean
- UCB1 cannot compute a mean for the root
- Counting visits is faster than dividing
= A child with 1 visit and a lucky rollout can have the best mean. Selection kept coming back to the most visited child because its UCB1 stayed high over many tries.
```

## How it relates to other searches

[Backtracking](/backtracking/) walks the whole tree, depth first, and is exact. It is fine for twelve sentences, and hopeless for Go. [Beam search](/beam-search/) goes one level at a time and keeps the best B, scored by probability so far. It never comes back to what it dropped. MCTS never drops anything; it just visits the poor parts less. [A\*](/a-star/) expands the most promising node first, using a heuristic for the cost still to come. MCTS has no heuristic, so it makes one: the average of random rollouts.

## Search at test time

AlphaGo (Silver et al. 2016) was MCTS with two networks. A policy network gave each move a prior, which steered selection toward moves a strong player would consider, and a value network judged positions, mixed with fast rollouts. It beat the European champion Fan Hui 5 games to 0. AlphaGo Zero (Silver et al. 2017) dropped the rollouts and judged positions with its network alone.

The same idea applies to a language model. Each node is a prefix, each child a next token or a next step of reasoning, rollouts let the model finish the answer, and a reward model or a checker scores the end. Searching over a model's outputs this way is one way to spend more compute when answering, instead of more compute in training: more iterations, a better answer, as on this page. Whether it pays off depends on how good the scorer is. A search is only as good as what it is told to look for.

## When to use it

MCTS suits a tree that is too big to search but where you can play to the end cheaply and get a score: games, planning, puzzles. It needs no evaluation function, and it can stop at any time and still give an answer. It is a poor fit when rollouts say little (a random finish tells you nothing about a good finish), when a good heuristic exists (use A\*), or when the tree is small enough to search exactly.

## Common mistakes

- Taking the move with the best mean instead of the most visits. A child with one lucky rollout can have the best mean.
- Forgetting that UCB1 assumes rewards in [0, 1]. Rewards on another scale need a different c.
- Computing UCB1 for a child with n = 0. Divide by zero. Add every child once before using the formula, as expansion does here.
- Adding the whole rollout path to the tree. The usual rule adds one node per iteration; the rollout leaves no trace.
- In a two-player game, backing up the same reward for both players. Each node should hold the value for the player who moved there.
- Expecting the same answer from every budget. [Ten iterations](#example:budget-10) picks cat, and so does 30; 100 picks dog.

## At real scale

The AlphaGo paper (2016) estimates Go at about 250 moves per position and 150 moves per game, and chess at about 35 and 80. The distributed AlphaGo that beat Fan Hui ran its search on 1202 CPUs and 176 GPUs. This page has 3 words, then 2, then 2: twelve sentences, a full tree of 22 nodes, and a budget of at most 100 iterations.

## Try this

- [The first rounds try each word once](#example:first-rounds): before iteration 6, work out the UCB1 of each child of the root. Which does selection pick?
- [30 iterations pick the safe word](#example:budget-30): change the budget to 100 and run again. When does dog pass cat?
- Set c to 0.5 and run 30 iterations. Is that closer to c = 0 or to c = √2?
- In [No exploring](#example:no-exploration), press Iterate a few more times. Does dog ever get a second visit?
- Run 100 iterations and look inside cat. Which of its sentences got the most visits, and does that match their scores?

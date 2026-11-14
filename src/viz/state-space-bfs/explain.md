# BFS over states

A lock with two wheels shows 00. You may turn one wheel up or down by one click, and some combinations are barred. What is the fewest turns to reach 02? Nobody hands you a graph here. But there is one: every combination is a vertex, and every turn an edge. Breadth-first search works on it as it is, as long as you make each state's neighbours when you need them.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| BFS over states, with a visited set | each state leaves the queue once and makes its moves | O(V · m) |
| no visited set, every sequence of moves | layer L holds every sequence of L moves | O(bᵈ) |
| extra space | the visited set and the queue | O(V) |

V is the number of states the search can reach, m the moves each state makes (2 per wheel, 25 per letter), b how many of them are allowed and d the distance to the goal.

This is the same [BFS](/bfs/) as on a stored graph: a queue, a distance for every state found, and layers. The layer a state is found in is its distance from the start. Only two things change. The neighbours come from a rule (turn a wheel, change a letter), and the visited set is a hash set of states instead of a color on each vertex. [Show me](#play:around-the-wall)

The **Approach** option switches to the naive way: no visited set, so every sequence of moves goes in the queue. Both find the same distance. `states` counts what leaves the queue and `moves` the neighbours made, kept or not; `naive total` and `pattern total` say what each approach costs on this input.

## How it works

1. Put the start in the queue and in the visited set, at distance 0.
2. Take the state at the front of the queue.
3. Make each of its moves. Skip a barred one, or one already visited. If the new state is the goal, its distance is the answer. Otherwise visit it, one move further, and queue it.
4. Repeat from 2 until the queue is empty: then the goal cannot be reached.

In [Around the wall](#example:around-the-wall), 01, 11 and 21 are barred: a wall across the second wheel's 1. From 00 the moves are 10, 90, 01 (barred) and 09, so layer 1 is 10 90 09. Layer 2 is 20 19 80 91 99 08. 00 comes up again from 10, 90 and 09, and is skipped each time: it is visited. The goal turns up while 92, in layer 3, makes its moves. 4 moves: 00 → 90 → 91 → 92 → 02. Turn the first wheel down to get round the wall, step the second wheel twice, come back.

That took 17 states off the queue and 65 moves, and visited 30 states. Notice the goal is checked when it is made, not when it leaves the queue. Checking it on the way out would expand 29 states here instead of 17.

```check
Q: BFS from 00 finds the goal in layer 4. What does that tell you?
- The goal was the fourth state found
- There is exactly one way to reach it in 4 moves
* No sequence of 3 moves or fewer reaches it
- It took 4 states off the queue
= Every state that 3 moves can reach is in layers 0 to 3, and the goal is not among them. There may be several ways to do it in 4.
```

## Moves made on the fly

The graph is never stored. A state's moves exist only while it is being expanded, and then they are gone. That matters when the graph is huge: a lock of 3 wheels has 1,000 combinations, and a 3 × 3 sliding-tile puzzle has 9! = 362,880 arrangements. Nobody wants to build those adjacency lists first. BFS only ever touches the states it reaches before it finds the goal.

[Three wheels](#example:three-wheels) shows the cost of more moves per state. Each state makes 6, so the layers fill fast: 81 states visited to find 110, four moves away.

## Words, one letter at a time

Switch **Puzzle** to words. A state is a word, and a move changes one letter, every step a word in the list. [Cold to warm](#example:cold-to-warm) finds cold → cord → word → ward → warm.

Here making the moves is the expensive part. A 4-letter word has 4 × 25 = 100 letter changes, and the search looks each one up in the word list. For cold, 97 of them are not words. So `moves` reaches 687 while only 7 words leave the queue. The other way, comparing a word with every word in the list, is cheaper when the list is short and much dearer when it is a whole dictionary.

## No visited set

Drop the visited set and the queue holds sequences of moves, not states. 00 goes in again from 10, from 90 and from 09, then 10 goes in again from each of those, and so on. [Every sequence of moves](#example:every-sequence) still finds 4 moves, because the sequences still come out shortest first. It just takes 34 sequences and 133 moves instead of 17 and 65, and the queue ends with 88 sequences in it. Each layer is about b times the one before: 1, 3, 11, 39.

On the word list the waste is worse. [Every sequence of words](#example:every-word-sequence) doubles the work, 1,387 moves against 687.

```check
Q: When should BFS mark a state as visited?
* When it goes in the queue
- When it leaves the queue
- When all its moves have been made
- Only when it is the goal
= Mark it on the way in. Marked on the way out, a state waiting in the queue can be queued again by every neighbour that sees it.
```

## When the goal cannot be reached

[A goal walled in](#example:walled-in) bars 45, 65, 54 and 56, the four neighbours of 55. BFS cannot know that until it has visited every combination it can reach, 95 of them, with 380 moves. Then the queue runs out and the answer is −1.

Without a visited set it would never stop. [No way through](#example:no-ladder) has cat, cot, cog, dog and pig: pig is not one letter away from anything. BFS gives up after 4 words. The naive way sends cat, cot, cog and dog back and forth for ever; the page stops it after 300 sequences.

## Spot it

Reach for this pattern when the problem says:

- **fewest moves, fewest steps, shortest sequence**, and every move costs the same;
- **a move changes one thing**: turn a wheel, change a letter, slide a tile, pour a jug;
- **states you could list but would rather not**: arrangements, combinations, strings;
- **only some states are allowed**: barred, not in the list, off the board.

Three problems of our own:

- Two jugs hold 3 and 5 litres. Fill one, empty one, or pour one into the other. Fewest steps to have exactly 4 litres in a jug? (A state is the pair of amounts.)
- A gene is 8 letters from A, C, G and T; a mutation changes one letter, and only strings in a bank are allowed. Fewest mutations from one gene to another? (The word puzzle with a 4-letter alphabet.)
- A knight on a chessboard: fewest moves to a given square? (Squares are states; the 8 jumps make the neighbours.)

Look-alikes: when moves cost different amounts (driving times, fares), BFS counts the wrong thing; use [Dijkstra](/dijkstra/). When the problem says "list every way", it wants [backtracking](/backtracking/), not the shortest. And a maze already drawn on a grid is [grid BFS](/grid-bfs/), where the neighbours are just the four cells around.

## When to use it

Use it for the fewest moves through a puzzle whose states are easy to make and compare. It needs a way to hash a state (a string or a tuple works) and a rule for the moves.

Avoid it when the space is so big that even the states within the goal's distance do not fit in memory. Searching from both ends at once, [bidirectional search](/bidirectional-search/), meets in the middle and explores far less: about 2 × b^(d/2) states instead of b^d.

## Common mistakes

- No visited set, or marking states on the way out of the queue. The search still finds the answer, if there is one, eventually.
- Forgetting the barred states, or checking them only for the goal.
- Checking the start: if it is the goal, the answer is 0, not 1.
- Making the moves wrongly at the edges: on a lock, 9 turns up to 0 and 0 turns down to 9.
- Using a stack instead of a queue. That is depth-first search: it finds a way to the goal, not the shortest one.

## Try this

- [Around the wall](#example:around-the-wall): before each step, say which state leaves the queue next.
- Load `01 10 09 90` and search for 55. Guess what happens first.
- [Round the back](#example:round-the-back): why is 08, two clicks from 00, 4 moves away?
- Press Compare, pick this page with other options, and set one side to no visited set. Search for 33 and watch `moves` on both sides.
- Switch to words, load `lead load goad gold bold bolt boat beat bead`, and search for gold. Which way round does BFS go?

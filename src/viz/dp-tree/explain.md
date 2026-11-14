# DP on trees

An org chart, everyone with a cheer score. You want the most cheer at the party, but nobody comes together with their direct boss. Which people do you invite? Trying every guest list works until the chart has thirty people. The tree trick: give every person two numbers, the best for their part of the chart with them invited and without them, and work up from the bottom. One walk, n calls.

Here the chart is a binary tree (at most two direct reports each), and the rule is: no chosen node is the parent of another chosen node. CLRS has the same problem as planning a company party, with any number of reports. The name in graph theory is a maximum-weight independent set; on a general graph it is hard, on a tree it is easy.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| best total, two values per node | take and skip for every node, from the leaves up | Θ(n) |
| best total, every allowed subset | decide each node in turn, in or out | exponential |
| read back the chosen nodes | walk down from the root, take or skip | Θ(n) |
| extra space | two numbers per node, plus the call stack | Θ(n) |

For a node v:

- **take(v)**: the best total in v's subtree with v chosen. Then its children must stay out, so take(v) = v + skip(left) + skip(right).
- **skip(v)**: the best total with v left out. Then each child is free to do whatever is best for it, so skip(v) = max(take, skip of left) + max(take, skip of right).

A missing child gives 0 and 0. The answer is max(take, skip) at the root. A node needs its children's numbers first, so the order is [post-order](/binary-tree/): left, right, then the node. [Show me](#play:mixed-levels)

The **Approach** option switches to the naive way, trying every allowed subset. Both give the same answer. The variable `calls` counts calls of the recursion, and `naive total` and `pattern total` say what each approach costs on this tree.

## How it works

[Neither level wins](#example:mixed-levels) is the tree 4 9 2 1 3 6 4 (level order), nodes A to G. The leaves come first. D = 1 is a leaf: take = 1, skip = 0. E, F and G work the same way.

Then B = 9 with leaves D and E. Take B: both children stay out, 9 + 0 + 0 = 9. Skip B: D gives max(1, 0) = 1 and E gives max(3, 0) = 3, so skip = 4. C = 2 over F = 6 and G = 4 goes the other way: take = 2, skip = 6 + 4 = 10.

At the root A = 4: take = 4 + skip(B) + skip(C) = 4 + 4 + 10 = 18. skip = max(9, 4) + max(2, 10) = 9 + 10 = 19. The best is 19: B, F and G. Seven nodes, seven calls.

Look at what the best does. It takes B from the middle level and F and G from the bottom. The obvious guesses are whole levels: the root and the bottom give 4 + 14 = 18, the middle gives 11. Neither is the answer. Each subtree makes its own choice, and the two values are how it tells its parent.

```check
Q: Node v has value 6 and two leaf children with values 4 and 5. What are take(v) and skip(v)?
- take 15, skip 9
* take 6, skip 9
- take 6, skip 5
- take 10, skip 11
= Take v and its children stay out: 6 + 0 + 0 = 6. Skip v and each leaf gives its better value: max(4, 0) + max(5, 0) = 9.
```

## Every allowed subset

The naive way is plain recursion. Number the nodes in level order and decide them one at a time: leave the node out, or take it if its parent is not taken. When every node is decided, that is one subset that follows the rule; keep the best total. The table of bits under the tree shows the current choice and the best so far.

On the same tree, [Try every allowed subset](#example:every-subset) makes 97 calls and scores 41 subsets to find the same 19. Two values per node took 7.

It gets worse fast. Even a chain, the thinnest tree there is, has Fibonacci-many allowed subsets: a chain of 4 has 8, a chain of 10 has 144. Bushier trees allow more. [Ten nodes, every subset](#example:ten-nodes) makes 437 calls against 10. This recursion is already the smart naive version: it never builds a subset that breaks the rule. Listing all 2ⁿ subsets and checking each would be worse.

Is the pattern always cheaper? On calls, yes: even [A single node](#example:one-node) is 1 call against 3. Each call of the pattern does a bit more arithmetic (two values, two maxes), so on three or four nodes nobody would notice the difference.

```check
Q: A chain of four nodes, each the parent of the next. How many subsets follow the rule, the empty one included?
- 4
- 5
* 8
- 16
= Count by hand or with the Fibonacci pattern: 1 node has 2 (in or out), 2 nodes have 3, 3 have 5, 4 have 8. Of the 16 subsets, the other 8 take a parent and its child.
```

## Reading the answer back

The two values give the total. To list the nodes, walk down from the root: a node is in when its parent is out and its take beats its skip. A node whose parent is in stays out, and its own children are free again.

Not next to each other does not mean every other one. [Two left out in a row](#example:two-in-a-row) is the chain 5, 1, 1, 5. Every other node gives 6 either way. The best is 10: the two ends, with both middle nodes left out.

Ties need a rule. In [A tie leaves the node out](#example:a-tie), the root 9 sits over children 5 and 4: take = 9, skip = 9. Both are best. The page leaves a tied node out, so the answer is the two children. Trying every subset keeps the first best it meets, and with "out" tried first that is the same one.

## Spot it

Reach for this pattern when the problem says:

- **a tree, a hierarchy, an org chart, a family tree, "no loops", "one way between any two"**: the structure hangs from a root;
- **a rule between a node and its parent or child**: not both, at least one of each pair, a boss and their report;
- **the best total, the fewest, how many ways**: an optimum built from parts;
- **for every node, something about its subtree**: sizes, heights, the best below it.

Three problems of our own:

- Lookout towers joined by trails with no loops, each with a view score. Staff towers, never two at the ends of one trail, for the most total view. (Two values per tower: staffed or not.)
- Rooms linked by doors, one way between any two rooms. Put guards in the fewest rooms so every door has a guard on at least one side. (Two values per room: guard or no guard; no guard forces a guard in every child.)
- A family tree with everyone's age. For every person, the oldest age among them and their descendants. (One value per node, from the children up.)

Look-alikes that call for something else: things in a row ("seats in a row, never two side by side") are a chain, where two running states from left to right are simpler than a tree. A map whose streets loop around is a graph, not a tree, and the same choice on a general graph is NP-hard. Picking items under a weight limit is the [knapsack](/dp-knapsack/): take or skip again, but the subproblem is a capacity, not a subtree.

## When to use it

Use it whenever the subproblems are subtrees. A node's answer depends only on its children's answers, plus whatever state the parent cares about (here: is the child in or out). Find the smallest state that lets the parent decide, give each node one value per state, and fill them in post-order. Two values here and for the guards; three when a node can also be covered by a child, as with a camera that watches its neighbours; one for subtree sizes.

Avoid it when the structure has cycles. Then a node's neighbours are not split into independent subtrees, and the values stop adding up. And if you only need the total for a tree of five nodes, every subset is fine.

## Common mistakes

- Taking every other level. It ignores that each subtree can choose its own level ([Neither level wins](#example:mixed-levels)).
- Keeping one value per node: best(v) = max(v + the best of its grandchildren, the best of its children). It is correct, but it reaches each grandchild from two places, and without a memo the calls grow like Fibonacci on a chain. Two values per node fix that.
- Using max(take, skip) of a child inside take(v). If v is in, its children must be out: use skip.
- Walking top-down before the children are done. The values only exist from the leaves up.
- Reading the answer back from max alone. Whether a node is in also depends on its parent: a child of a chosen node stays out even when its take is bigger.

## Try this

- [Neither level wins](#example:mixed-levels): before you run it, guess take and skip at the root.
- Build `5 1 _ 1 _ 5` and guess the answer before you press Best total.
- [Try every allowed subset](#example:every-subset): watch the bits table count. When does the best first reach 19?
- Change the root of [A tie leaves the node out](#example:a-tie) from 9 to 10. Who is in now?
- Press Compare, pick this page with other options, and set one side to every allowed subset. Fill both with a random tree of 10 nodes and watch `calls`.

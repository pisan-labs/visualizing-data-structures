# Min-cost flow

Maximum flow asks how much can get through. Usually there is a second question right behind it: how much will that cost? Every arc now has a capacity and a price per unit, and among all the flows of a given size we want the cheapest.

## The idea

| Operation | What it finds | Cost |
|---|---|---|
| successive shortest paths, Bellman-Ford | a maximum flow of minimum cost | O(k · VE) for k paths |
| the same with potentials and Dijkstra | the same flow, faster searches | O(k · E log V) |
| stopping at a target of k units | the cheapest flow of value k | fewer paths |

The rule is short. Start with no flow. Find the cheapest path from s to t in the residual network, push as much as it has room for, and repeat until t cannot be reached (or the target is met). Each label reads flow/capacity and $cost per unit. [Show me](#play:cheapest-first)

In [Cheapest paths first](#example:cheapest-first), the five paths cost 15, 20, 21, 22 and 23 per unit and carry 4, 4, 5, 8 and 2 units. The total is 23 units for 467. Notice the prices only go up.

## Sending flow back

The residual network is the one from [maximum flow](/max-flow/), with prices. Going forward along u→v costs cost(u, v). Going backward along the reverse arc v→u takes back a unit that was sent along u→v, so it saves cost(u, v): its cost is -cost(u, v).

That negative cost is the whole trick. In [Sending flow back](#example:send-back), the first path s→a→b→t costs 1 + 1 + 1 = 3 and uses up both b→t and a→b. The next path goes s→b, back along b→a at -1, then a→t: 3 - 1 + 4 = 6. Afterwards, a→b carries nothing. The result is s→a→t plus s→b→t, 5 + 4 = 9, which is the best two units can do. [Show me](#play:send-back)

Turn on **Draw the residual network** and have a look at [the residual network, with costs](#example:residual-costs): the dashed reverse arcs show their negative prices.

```check
Q: An arc u→v costs 4 per unit and carries 2 units. What does one unit along the reverse arc v→u cost?
- 4
- 0
* -4
- -8
= Going along v→u takes back one of the units on u→v, and gets its 4 back.
```

## Why the cheapest path every time works

Here is the invariant: after each push, the flow is the cheapest flow of its value. A flow is cheapest exactly when its residual network has no negative-cost cycle (a negative cycle is a way to reroute some flow and save money). Pushing along a cheapest path never creates one. At the start there is no flow and every cost is at least 0, so there is no negative cycle either. Induction does the rest.

Two consequences:

- The path prices never go down. If they did, you would have found a cheaper way earlier.
- You can stop at any amount. With **Units to send** at 10, [Only 10 units](#example:target) sends 4 at 15, 4 at 20 and just 2 of the third path's 5 at 21: 182. No 10 units cost less. [Show me](#play:target)

Min-cost flow does not save money by sending less. In [Cheap but narrow](#example:cheap-but-narrow), one unit goes through a for 2 and the other five through b for 10 each. Maximum flow comes first; the price only decides how.

```check
Q: The third cheapest path costs 21 per unit. What can the fourth one cost?
- Anything less than 21: the residual network has changed
* 21 or more
- Exactly 21
- Only less than 21 if it uses a reverse arc
= After every push the flow is the cheapest of its size, so the next unit can never be cheaper than the last one was.
```

## Bellman-Ford or Dijkstra

The reverse arcs have negative costs, and Dijkstra refuses those. So the plain version (the default) uses Bellman-Ford: passes over every residual arc, stopping after a pass that changes nothing.

Potentials fix Dijkstra. Give every vertex a number h(v), and use the reduced cost c(u, v) + h(u) - h(v) instead of c(u, v). Along any path from s to t the h terms cancel except h(s) and h(t), so the cheapest path stays the cheapest. If h is the distance from the previous search, every reduced cost on the residual network is at least 0. So: start with h = 0 (costs are at least 0), and after each search add the distances to h. This is Johnson's trick from all-pairs shortest paths.

Pick **Dijkstra with potentials** and run [Dijkstra with potentials](#example:potentials). The table gets a row for h, and the paths are the same five. [Show me](#play:potentials)

## When to use it

Anything that ships stuff through a network with prices: freight, power, data. The assignment problem (n workers, n jobs, a price for each pairing) is min-cost flow on the matching network; try the **Assignment** preset. Transportation problems, minimum-cost circulations and plenty of scheduling problems reduce to it too.

Linear programming solves all of these, and network simplex is what serious solvers use. Successive shortest paths is the one you can follow by hand, and it is fine when the flow is small.

## Common mistakes

- Running Dijkstra on the residual network without potentials. The reverse arcs are negative, and it will get some paths wrong.
- Giving reverse arcs the same cost as their arc instead of minus it.
- Starting with a negative cycle. The method assumes none; this page only takes costs of 0 or more, so that cannot happen here.
- Arcs both ways between two vertices. The page refuses them; put a vertex in the middle of one, as CLRS does.
- Thinking the cheapest flow sends less. It sends the amount you asked for, cheapest.

When t cannot be reached at all, there is nothing to pay. [Have a look](#example:no-route).

## Try this

- Before running [Cheapest paths first](#example:cheapest-first), find the first path's cost by hand. Then predict the second.
- In [Sending flow back](#example:send-back), change a>t:1:4 to a>t:1:9. Does the second path still take flow back?
- Set **Units to send** to 1, then 5, then 13 on the starting network. Write down the cost each time. What do the differences tell you?
- Run [Dijkstra with potentials](#example:potentials) and check that the reduced distance plus h(t) gives the real price.
- Use **Compare** to put this page next to [maximum flow](/max-flow/) on the same network.

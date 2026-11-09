# Push-relabel max flow

Edmonds-Karp finds a whole path from s to t, pushes flow along it, and searches again. Push-relabel never looks for a path. It floods the arcs out of s, and then the extra water runs downhill, one arc at a time, until it either reaches t or finds its way back to s.

| Operation | What it does | Cost |
|---|---|---|
| `INITIALIZE-PREFLOW(G, s)` | s gets height \|V\|, every arc out of s is filled | O(V + E) |
| `PUSH(u, v)` | sends min(u.e, c_f(u, v)) down an arc one level lower | O(1) |
| `RELABEL(u)` | lifts u to 1 + the lowest height it has room to reach | O(deg u) |
| the whole run | push and relabel until nothing overflows | O(V²E), O(V³) with FIFO |

[Show me](#play:fifo-order)

## Preflow, excess and heights

A flow has to balance at every vertex: what comes in goes out. A **preflow** relaxes that. A vertex may hold more than it passes on, and the difference is its **excess**, u.e. A vertex with u.e > 0 is **overflowing**. s is allowed to be negative: it has sent out more than it received.

Every vertex also has a **height** u.h. The rule is simple: flow only goes along an arc with room in the residual network, and only one level down, from height k + 1 to height k. Such an arc is **admissible**. s starts at height |V| and t at 0, and neither ever moves.

The page writes each height next to its vertex (h=3), and the table beside the network has every height and excess. Overflowing vertices have a dashed ring. In [Heights carry 23 units downhill](#example:fifo-order), the preflow fills s→a with 16 and s→b with 13. Now a and b overflow, and e(s) = −29.

## Push and relabel

Take an overflowing vertex u. If an arc out of u is admissible, push: send the excess or the room on the arc, whichever is smaller. A push that fills the arc is **saturating**. A push that empties u is not, and u is done for now.

If no arc out of u is admissible, relabel: lift u to one above the lowest neighbour it still has room to reach. Now at least one arc goes exactly one level down, and u can push again.

At the start every vertex except s is at height 0, so nothing is admissible. The first thing a does is rise to height 1. Then a→c goes downhill and a pushes 12 to c. Have a look at the counters as it runs: pushes, saturating pushes, relabels and arc checks.

```check
Q: u has excess 7 at height 3. The arc u→v has room 4 and v is at height 2. What does PUSH(u, v) do?
- Sends 7 to v
* Sends 4 to v and fills the arc; u still has 3
- Nothing: u must relabel first
- Sends 3 to v
= Δ = min(u.e, c_f(u, v)) = min(7, 4) = 4. The arc is full now (a saturating push) and u keeps 3 for its next neighbour.
```

## Where the extra goes

What if s sends more than t can take? In [Extra flow climbs back to s](#example:back-to-source), s pushes 9 into a, but only 5 can reach t. The other 4 sit in a, b and c with nowhere downhill to go. So they relabel, again and again, until they stand at height 6, one above s. Then the reverse arc a→s is admissible, and the 4 units go home. [Show me](#play:back-to-source)

That is why heights can go up to 2|V| − 1, and why there are at most 2|V|² relabels in all. Every overflowing vertex always has a path back to s in the residual network (the excess came from somewhere), so a relabel always has a neighbour to measure against.

When nothing overflows, the preflow is a flow, and it is a maximum one. The vertices s can still reach in the residual network are the s side of a minimum cut, the same cut the [max-flow](/max-flow/) page finds.

```check
Q: Why can't push-relabel stop with flow that could still reach t?
- It can; that is why it needs a second phase
* There is never a residual path from s to t: s is |V| levels up, and a path can only drop one level per arc
- Because it pushes the full capacity of every arc
- Because t has the lowest height
= Heights drop by at most one per residual arc, and a simple path has fewer than |V| arcs. s at height |V| and t at 0 are too far apart, so the residual network never has an s-t path, and the final flow is maximum.
```

## Which vertex next?

Any overflowing vertex will do, so the rule is a setting. Each rule drains its vertex with DISCHARGE: keep pushing, and relabel when u runs out of neighbours, until its excess is gone. Each vertex keeps a pointer to its current neighbour, so it scans its list once per height.

- **FIFO** (the default) keeps a queue. A vertex that starts to overflow joins the back. O(V³).
- **Highest label** always drains the vertex standing highest. Excess moves down in waves instead of sloshing back and forth. O(V²√E). On [the same network as before](#example:highest-first) it takes 12 pushes and 10 relabels instead of 15 and 12.
- **Relabel-to-front** is CLRS's version: a list L of the other vertices, drained in order, and a vertex that rose moves to the front of L. O(V³). [Show me](#play:relabel-to-front)

Turn on **Draw the residual network** for [the residual network, with heights](#example:residual-heights). Every push goes along an arc with room, dashed or not, from one height to the one below.

## Against Edmonds-Karp

At the end the page also runs Edmonds-Karp on the same network and counts its arc checks the way the max-flow page does. On small networks Edmonds-Karp usually wins. The classic network takes 105 arc checks here and 53 there. [A narrowing chain](#example:long-chain) is worse: one augmenting path for Edmonds-Karp, and 10 pushes and 7 relabels here, because the flood out of s keeps getting stuck and sent back.

Push-relabel wins when many paths share arcs. In [a funnel](#example:funnel), four arcs feed one vertex e. Edmonds-Karp searches the whole network four times. Push-relabel moves each excess one arc at a time and e sends all 8 on in a single push: 35 arc checks against 60. The gap grows with the network. Real implementations add two tricks this page leaves out: global relabeling (set every height to its true distance from t now and then) and the gap heuristic. With those, push-relabel is one of the fastest maximum-flow algorithms in practice.

Use **Compare** to put this page next to [max-flow](/max-flow/) on the same network.

## Common mistakes

- Pushing uphill or sideways. A push needs u.h = v.h + 1 exactly, not just u.h > v.h.
- Forgetting the reverse arcs. Excess that cannot reach t returns to s along them.
- Relabelling to the lowest neighbour's height. It is one more than that, or the arc is still not downhill.
- Putting s or t in the queue. They never overflow in the sense that matters, and their heights never change.
- Stopping when t has the right amount. The run ends when nothing overflows, and the leftover excess still has to get home.

## Try this

- In [Heights carry 23 units downhill](#example:fifo-order), predict each relabel before the page does it.
- Run [Extra flow climbs back to s](#example:back-to-source) with each rule and compare the **pushes** counter.
- [Straight to the sink](#example:straight-to-t) is the easy case. How many relabels must it take? Why can it not take fewer?
- Load `s>a:5, s>b:5, a>b:2, a>t:3, b>t:4` and guess the maximum flow and the final heights first.

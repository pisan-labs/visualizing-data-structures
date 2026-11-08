# Consistent hashing

You have 1000 cached pages spread over 4 servers, and the obvious rule: page k goes to server h(k) mod 4. It works until the day you add a fifth server. Now the rule is h(k) mod 5, and almost every page lives somewhere else. About 800 of the 1000 move, and the cache is cold while they do.

Consistent hashing (Karger and others, 1997) fixes that. Adding or removing a server moves only the keys next to it, about 1/N of them, and leaves the rest alone. Distributed caches, Amazon's Dynamo, Cassandra and many load balancers use it.

## The ring

Bend the range of the hash into a circle: positions 0 to 359 here, like degrees. Hash each server to a position on it. Hash each key too. A key belongs to the first server you reach going clockwise from it, wrapping past 359 back to 0.

Here keys use h(k) = ((71·k + 5) mod 1009) mod 360, and server nodes use a second hash of the number 100·s + r (s = 1 for A, 2 for B, …; r numbers the virtual nodes), so you can check every position. [Three servers on a ring](#example:three-servers) has A at 218, B at 59 and C at 260, and twelve keys. [Show me](#play:three-servers).

| Operation | What it does | Cost |
|---|---|---|
| `lookup(k)` | Hash k, find the first node clockwise | O(log(Nv)) with a sorted list of nodes |
| `addServer(s)` | Put s's v nodes on the ring; keys just before them move to s | O(v log(Nv)), plus about n/N keys moved |
| `removeServer(s)` | Take s's nodes off; its keys move to the next node clockwise | O(v log(Nv)), plus s's keys moved |

N is the number of servers, v the virtual nodes per server and n the number of keys. Variables shows the load of every server, and after a change, how many keys moved and how many h(k) mod N would have moved.

## Adding and removing servers

When server D joins, it lands somewhere in an arc that used to belong to another server. The keys between the previous node and D now reach D first, so they move to D. Every other key reaches the same node as before. [Adding a server moves few keys](#example:add-a-server): 3 of the 12 keys move, all to D. With h(k) mod N, going from 3 servers to 4 would have moved 9. [Show me](#play:add-a-server).

Removing is the mirror image. [Removing a server](#example:remove-a-server): B leaves, and only B's 4 keys move, each to the next node clockwise. Nobody else notices.

```check
Q: Nodes sit at A = 40, B = 150, C = 300. A key hashes to 320. Which server holds it?
* A: past 359 the walk wraps to 0 and reaches A at 40
- C: it is the nearest node
- B: it is in the middle
= Clockwise from 320 there is no node before 359, so the walk continues from 0 and reaches A at 40.
```

## Virtual nodes

The removal example has a sting in the tail: all of B's keys went to A, which now holds 11 of the 12. With one node each, servers get arcs of very different lengths (look at the loads in [Three servers on a ring](#example:three-servers): 7, 4 and 1), and a failure dumps the whole arc on one neighbor.

The fix is to give each server several nodes, called virtual nodes, scattered round the ring. Each server then owns many small arcs, the lengths average out, and when a server leaves, its keys spread over several neighbors. [Virtual nodes even out the load](#example:virtual-nodes) uses 3 nodes per server and ends with loads 2, 2, 4 and 4 after D joins, taking keys from more than one server. With 100 or more nodes per server, as real systems use, the loads come out within a few percent. The **Virtual nodes** option sets v.

Virtual nodes also let a bigger machine take a bigger share: give it more nodes.

```check
Q: Why do real systems give each server many virtual nodes?
- So a lookup needs fewer steps
* So each server's share of the ring, and of the keys, comes out close to 1/N
- So keys never have to move
= With one node each, arc lengths vary a lot. Many small arcs per server average out, and a departing server's keys spread over many others.
```

## When to use it, and when not

Use it when servers come and go and moving data is expensive: distributed caches, sharded databases, partitioned queues, sticky load balancing. Clients can compute the owner of a key themselves, with no central table.

Avoid it when:

- the set of servers never changes (h(k) mod N is simpler and perfectly even);
- you need exact balance (consistent hashing is only even on average; look at bounded-load variants or rendezvous hashing);
- you have a central coordinator anyway, which can keep an explicit table of which range goes where.

## Common mistakes

- Using one node per server and expecting even loads.
- Forgetting the wrap-around. Keys past the last node belong to the first node.
- Hashing server names that change (an IP address after a restart), which moves the server and its keys.
- Thinking nothing moves. About 1/N of the keys still move on every change, and a cache still has to warm up for them.

## Try this

1. Load [Three servers on a ring](#example:three-servers), then add server D. Which keys move? Then remove it again. Do they come back?
2. Set **Virtual nodes** to 4 and replay [Three servers on a ring](#example:three-servers). How do the loads change?
3. Load [Removing a server](#example:remove-a-server) with 1 node per server and with 4. Where do B's keys go each time?
4. Use the **Five servers and random keys** preset with 18 keys, then remove one server. Compare `moved` with `mod-N moved`.

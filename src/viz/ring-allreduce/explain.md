# Ring all-reduce

Training on one GPU is slow, so you train on many. Each worker takes its own slice of the batch, runs [backpropagation](/backpropagation/), and gets its own gradient. Before anyone takes the next [gradient descent](/gradient-descent/) step, every worker needs the same thing: the sum of all the gradients (divided by N, for the average). That is an all-reduce.

The obvious way is a parameter server. Everyone sends their gradient to one machine, it adds them up, and it sends the sum back. With N workers that machine's link carries N whole gradients in and N out, and everybody waits for it. Ring all-reduce has no centre. Every worker talks only to its neighbour, and each sends less than two copies of its gradient however many workers there are.

## The idea

| Stage | Steps | In step t (from 0), worker i sends | The receiver |
|---|---|---|---|
| reduce-scatter | N − 1 | chunk (i − t) mod N | adds it to its own copy |
| all-gather | N − 1 | chunk (i + 1 − t) mod N, finished | keeps it |

Each gradient of M numbers is cut into N chunks, one per worker. Here a chunk is one number; in a real model it is millions. Every step, all N workers send one chunk at the same time, so no link is idle and no worker waits for another. Each worker sends 2(N − 1) chunks in all: 2(N − 1)/N · M numbers. [Show me](#play:four-workers)

## Reduce-scatter

Start with [Four workers add up their gradients](#example:four-workers). The gradients are (3, 1, 4, 1), (5, 9, 2, 6), (5, 3, 5, 8) and (9, 7, 9, 3), and everyone needs (22, 20, 20, 18).

In step 1 worker 1 sends its a, 3, to worker 2, which adds it to its own: 5 + 3 = 8. At the same moment worker 2 sends b (9) to worker 3, worker 3 sends c (5) to worker 4, and worker 4 sends d (3) round to worker 1. In step 2 each worker passes on the chunk it has just added to. A chunk's running sum moves one worker to the right each step and picks up one more gradient on the way.

After N − 1 = 3 steps each running sum has visited every worker. Worker 1 holds the whole b (20), worker 2 the whole c (20), worker 3 the whole d (18) and worker 4 the whole a (22). Each worker owns exactly one finished chunk, and the rest of its cells are partial sums. [Reduce-scatter alone](#example:scatter-only) stops right there.

```check
Q: Five workers run reduce-scatter. Which chunk does worker 3 hold complete at the end?
- c, its own
* d
- b
- e
= The running sum for chunk d starts at worker 4 and moves right: 5, 1, 2, then 3. Worker i always ends with chunk i + 1, wrapping round.
```

## All-gather

Now every finished chunk has to reach every worker. Same ring, same rhythm: in step 1 each worker sends the chunk it finished, and the receiver keeps it, no adding. Then each passes on what it just received. After N − 1 more steps everyone holds (22, 20, 20, 18).

Note that each chunk was added up exactly once, by one chain of workers, and then copied. So all four workers end with the very same numbers. With floating-point gradients that matters: four workers adding in four different orders could end a few bits apart, and their models would slowly drift. [Gradients that cancel](#example:negative-gradients) has a chunk that comes to −2 + 3 − 6 = −5 on everyone.

## Counting the data

Each step a worker sends one chunk, M/N numbers. There are 2(N − 1) steps, so it sends 2(N − 1)/N · M:

- [Two workers](#example:two-workers): 2 × 1/2 = 1 vector. The ring is just a swap.
- [Four workers](#example:four-workers): 6/4 = 1.5 vectors.
- [Five workers](#example:five-workers): 8/5 = 1.6 vectors.

It creeps up towards 2 and never gets there. The parameter server's link, in contrast, carries 2N vectors: 8 for four workers, and it grows with every worker you add. Patarasuk and Yuan (2009) showed you cannot beat the ring on this count: in any all-reduce, some worker has to send at least 2(N − 1)/N · M.

```check
Q: Five workers each have a 600 MB gradient. In a ring all-reduce, how much does each worker send?
- 600 MB
* 960 MB
- 1200 MB
- 3000 MB
= Each chunk is 600 / 5 = 120 MB, and each worker sends 4 chunks in each stage, 8 in all: 8 × 120 = 960 MB. A parameter server would take in 5 × 600 = 3000 MB on its one link.
```

## The price: steps

The data is optimal. The number of steps is not: 2(N − 1), and each one starts only when the slowest link has finished the last one. With a start-up cost per message, the time is roughly 2(N − 1) start-ups plus 2(N − 1)/N · M divided by the link speed. For big gradients the second part wins and the ring is excellent. For small messages, or for hundreds of workers, the start-ups add up, and libraries such as NVIDIA's NCCL offer tree-shaped all-reduces too.

## The ring as a data structure

Each worker knows one thing: who is next. That is a [circular linked list](/circular-linked-list/), and the chunk numbers wrap round mod N like the indices of a [queue in a circular array](/queue-array/). The machines and cables form a graph ([graph representations](/graph-representations/)); laying a ring over it means finding a cycle that visits every machine once, ideally using the fast links. A library can also lay several rings over the same machines at once, so more links are busy.

## When to use it

Use it for data-parallel training whenever the gradient is large and the links between workers are about equally fast. That is the usual case for the gradients of a neural network, which is why Horovod and others built on it.

Use half of it when that is all you need. ZeRO (Rajbhandari et al., 2020) splits the optimizer state across workers, so each worker updates only its own slice of the weights. It needs only its slice of the summed gradient, which is exactly what reduce-scatter leaves. [Reduce-scatter alone](#example:scatter-only) sends 3/4 of a vector instead of 1.5.

Avoid it when one link is much slower than the rest: every step waits for it. And when messages are tiny, the 2(N − 1) steps cost more than the data.

## Common mistakes

- Adding during all-gather. The chunks are already finished; adding again counts gradients twice.
- Sending one chunk at a time round the whole ring. All N workers send every step; otherwise it takes N times as long.
- Thinking more workers means less data per worker. The chunks get smaller, but there are more of them: the total heads for 2M.
- Forgetting the average. The ring adds; divide by N for the mean gradient. [Every worker has the same gradient](#example:same-gradient) ends with three times it.
- Expecting a worker with no gradient to finish early. [Only one worker has a gradient](#example:one-worker-learns) costs exactly as much as any other all-reduce.

## At real scale

Baidu's researchers brought ring all-reduce from high-performance computing to deep learning in 2017, and Horovod (Sergeev and Del Balso, 2018) built its GPU communication on ring reduction. ZeRO (2020) counts the cost of standard data parallelism the same way this page does: a reduce-scatter and an all-gather of Ψ numbers each, 2Ψ per training step. For a sense of size: a model with a billion parameters has a 4 GB gradient in 32-bit floats, so on 8 GPUs each one sends 2 × 7/8 × 4 = 7 GB per step. The toy here sends single numbers.

## Try this

- [Four workers add up their gradients](#example:four-workers): before step 2, say which chunk each worker will send.
- Set N to 3 and load `1 2 3 / 4 5 6 / 7 8 9`. Which worker finishes which chunk?
- In [Reduce-scatter alone](#example:scatter-only), find a cell that holds the sum of exactly two workers. Which two?
- Run [Two workers](#example:two-workers), then [Five workers](#example:five-workers). How does **vectors sent per worker** change, and how does **server link, in and out**?
- [Only one worker has a gradient](#example:one-worker-learns): could you skip any steps here? What would you need to know in advance?

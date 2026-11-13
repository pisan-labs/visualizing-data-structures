# Continuous batching

A GPU is fast at one big matrix product and slow at many small ones. So a server does not run one request at a time: it puts several in a **batch** and moves all of them one token forward in each pass of the model, one **iteration**. The question is when a request may join the batch, and when it may leave.

The old answer is per request. Start a batch, run it until every request in it is done, return the answers, start the next. Yu et al. (2022) asked what happens if you decide again at every iteration instead. Their system, Orca, called it iteration-level scheduling. Everyone else calls it continuous batching.

## The idea

| Policy | A request joins | A request leaves | One iteration costs |
|---|---|---|---|
| static | when every slot is free: a new batch starts | when the longest request in its batch is done | Θ(S) |
| continuous | at the next iteration after a slot frees | as soon as its own last token is out | Θ(S) |

Here S is the number of slots, the requests a batch holds. The chart has one row per slot and one column per iteration; iteration t runs from time t to time t + 1. Above it, each letter sits where its request arrives. A shaded cell is a request's first iteration, its **prefill**: it reads the whole prompt and writes its first token. Every cell after that writes one more token. A dashed cell is an idle slot, red when someone was waiting for it. [Show me](#play:static-waits)

## Static batching

[Static batching waits for the longest](#example:static-waits) has 3 slots and five requests. A, B and C arrive at 0 and start the first batch. A writes 2 tokens, B 6 and C 3. A is done at time 2 and C at 3, but their slots sit idle until B is done at 6, and all three answers come back together at 6. Meanwhile D arrived at 1 and E at 2, and they wait for the whole batch. They start at 6 and are done at 9.

Count the cost. 16 tokens in 9 iterations is 1.78 tokens per iteration, out of a possible 3. 11 slot-iterations are idle, and 7 of them are idle while D or E stands in line. D waits 5 iterations for a slot that has been free since time 2.

```check
Q: Static batching, 2 slots. A and B arrive at 0; A writes 6 tokens, B writes 1. C arrives at 1 and writes 2. When is C done?
- 3
- 6
* 8
- 9
= C cannot join a running batch. The batch of A and B ends at 6, when A is done. C starts then and writes 2 tokens: done at 8.
```

## Continuous batching

Now the same five requests with continuous batching: [Continuous batching fills each free slot](#example:long-and-short). A is done at 2, and D takes its slot at the very next iteration. C is done at 3 and E takes its slot. Everyone is done at 6 instead of 9: 2.67 tokens per iteration. D waits 1 iteration instead of 5, E 1 instead of 4. A and C get their answers at 2 and 3 instead of 6.

Only 2 slot-iterations are idle, at the very end, when nobody is left to fill them. The **idle while a request waits** counter is 0, and with continuous batching it always is: a free slot is filled before the iteration runs. Use **Compare** to put the two policies side by side.

The waiting line is a plain FIFO queue, first come first served, like a [queue in an array](/queue-array/). The scheduler does almost nothing; it just does it every iteration.

## Prefill and decode in one batch

Look at the **tokens** row under the chart. In iteration 0 of [Static batching waits for the longest](#example:static-waits), A, B and C read their prompts: 5 + 3 + 8 = 16 tokens through the model. In iteration 1 each writes one token: 3. A prefill is the whole prompt in one pass; a decode is one token (see the [KV cache](/kv-cache/)).

Continuous batching mixes the two. When D joins at time 2, its 4-token prompt goes through in the same iteration as the others' single tokens. Orca made that work with what it called selective batching: the matrix products run on all the tokens together, and only attention is done request by request, since each request has its own cache. On this page every iteration counts the same. In a real server, an iteration with a long prompt in it takes longer, which is why later systems cut long prompts into chunks.

## One long request

Static batching suffers most when one request is much longer than the rest. In [One long request among short ones](#example:one-long), A writes 8 tokens and the other five write 1 or 2. Static batching holds two slots idle next to A for most of 8 iterations while D, E and F wait, and everyone is done at 10. 13 of the 15 idle slot-iterations are idle while someone waits.

With continuous batching the short requests flow past A through the other two slots, and everything is done at 8. A still takes 8; nothing can make a request faster than its own length. Batching changes the waiting, not the work.

```check
Q: Continuous batching, 2 slots. A (writes 6) and B (writes 1) arrive at 0; C arrives at 1 and writes 2. When is C done?
- 6
- 8
* 3
- 2
= B is done at 1, so its slot is free for iteration 1, and C takes it right away. C writes tokens in iterations 1 and 2: done at 3.
```

## When static batching is enough

If every request has the same length and they all arrive together, a batch has no stragglers. In [Equal lengths: static batching is enough](#example:equal-lengths), six requests of 3 tokens run as two full batches: 18 tokens in 6 iterations, 3 per iteration, no idle slot at all.

Light traffic is not enough. In [A steady stream never waits](#example:steady), requests come a few iterations apart and, with continuous batching, nobody waits at all. Switch to static. A arrives alone at 0 and starts a batch of one. B arrives at 1 and waits 2 iterations beside an empty slot. Real chat traffic is the hard case: lengths vary a lot, and requests arrive all the time.

## When to use it

Any server that generates text for many users at once. Continuous batching keeps the batch full, which is where the throughput comes from, and lets short answers come back early. The price is memory: requests join and leave all the time, each with a KV cache of its own length, so the memory has to be managed in small pieces. That is the [paged KV cache](/paged-attention/), and the two ideas usually come together.

For offline jobs with requests of equal length, static batching is simpler and just as good.

## Common mistakes

- Thinking continuous batching makes a request faster. A request of n tokens still takes n iterations; it waits less.
- Counting idle slots as waste when nobody is waiting. The last iterations of any run have them.
- Forgetting that a static batch returns together. A short request in a long batch is done early but answered late.
- Treating a prefill as one token of work. It reads the whole prompt; look at the **tokens** row.
- Thinking the slot count is free. Each slot holds a request's KV cache, so memory sets the batch size.

## At real scale

Yu et al. (OSDI 2022) served GPT-3 (175 billion parameters) with Orca and report 36.9 times the throughput of NVIDIA FasterTransformer at the same latency. Kwon et al. (2023) combined iteration-level scheduling with paged KV memory in vLLM and report 2 to 4 times the throughput of FasterTransformer and Orca. A real batch holds far more requests, limited mostly by the memory for their caches; this page has 2 to 4 slots and 6 requests so the chart fits a phone.

## Try this

- In [Static batching waits for the longest](#example:static-waits), switch to continuous batching. Which requests get their answers sooner, and by how much?
- Add 4 slots to [One long request among short ones](#example:one-long). Does static batching catch up?
- Predict the throughput of [Six requests at once](#example:burst) before you run it. Then check the **tokens per iteration** counter.
- Make static batching as good as continuous: type requests that never leave a slot idle while someone waits.
- Add `0 5 8`, `0 2 1`, `1 3 1`, `2 4 1` with 2 slots. How long does the last short request wait under each policy?

# Paged KV cache (PagedAttention)

A server answers many requests at once, and every one of them keeps a [KV cache](/kv-cache/): a key and a value for every token so far. The cache grows by one token per step, and nobody knows in advance how long an answer will be. So where do you put it?

The simple answer is one contiguous piece per request, big enough for the longest answer allowed. Most of it sits empty. Kwon et al. (2023) borrowed the answer an operating system gives for the same problem: paging. Cut the memory into small blocks of equal size, hand a request a block only when it needs one, and keep a table of which blocks it has. Their system is vLLM, and the attention that reads keys and values out of scattered blocks is PagedAttention.

On this page a slot holds one token's key and value, and shows only its position. The pool always has 48 slots. With blocks of 4 tokens, that is 12 blocks.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| add(n) | a request with an n-token prompt: pop ⌈n / B⌉ blocks off the free list | Θ(n / B) |
| step | every request writes one token; a new block only when its last block is full | Θ(r) for r requests |
| finish(X) | lower each block's reference count; a block at 0 goes back on the free list | Θ(n / B) |
| fork(X) | a second answer to X's prompt: copy the block table, add one to each count | Θ(n / B) |

Here B is the block size and n a request's length. A request's **block table** maps its logical blocks (tokens 1 to 4, 5 to 8, ...) to physical blocks anywhere in the pool. [Show me](#play:on-demand)

## Blocks on demand

Start with [Blocks are handed out as tokens arrive](#example:on-demand). A arrives with 5 tokens. That needs two blocks: block 0 holds tokens 1 to 4, block 1 holds token 5 and three empty slots. B arrives with 3 tokens and gets block 2, with one empty slot.

Now press Step. A's token 6 goes into block 1, where there is room. B's token 4 fills block 2. At the next step B's last block is full, so B pops block 3 off the free list. At the third step A fills block 1, and at the fourth it gets block 4. After four steps A's table is [0, 1, 4] and B's is [2, 3]: 16 tokens in 5 blocks, 4 slots empty.

The empty slots are only ever in a request's last block. That is the whole trick. Waste is at most B − 1 slots per request, however long it gets.

```check
Q: Blocks hold 4 tokens. A request has 9 tokens and writes one more. How many blocks does it use now?
- 2
* 3
- 4
- 10
= 9 tokens need ⌈9 / 4⌉ = 3 blocks, and the third has 3 empty slots. Token 10 goes into one of them: still 3 blocks.
```

## Freeing, and the free list

Here the free list is a stack of block numbers: allocation pops the top, freeing pushes on top. Nothing fancy, the same as a [stack in a linked list](/stack-list/). Both are O(1), and any free block is as good as any other, so there is no searching for a hole that is big enough.

In [A finished request's blocks go to the next one](#example:finish-frees), A (6 tokens, blocks 0 and 1) finishes. Its blocks go back on the free list, last block first, so block 0 ends up on top. Then D arrives with 9 tokens and gets blocks 0, 1 and 6. D's table is [0, 1, 6]: not contiguous, and it does not matter. Attention reads the blocks through the table, the way a program reads memory through a page table.

## Sharing a prompt

Parallel sampling asks for several answers to one prompt. The prompt's keys and values are the same for all of them, so why store them twice?

In [Parallel samples share the prompt](#example:fork-shares), A has 6 tokens in blocks 0 and 1. Fork A twice: B and C get copies of A's block table, [0, 1], and both blocks now have a **reference count** of 3. No block was copied. Three answers, the memory of one.

The trouble starts when they write. Block 1 holds tokens 5 and 6, with two empty slots, and each sample wants to put a different token 7 there. So the first one to write copies the block first: **copy on write**. A pops block 2, copies tokens 5 and 6 into it, and block 1's count drops to 2. B does the same with block 3, and the count drops to 1. C finds the count at 1 and writes in place. Block 0 is full, so nobody ever writes into it, and it stays shared by all three for as long as they live.

Turn sharing off and run [Without sharing, a fork copies everything](#example:fork-copies). Each fork copies both blocks at once: 4 copies instead of 2, and 9 blocks in use after three steps instead of 7. The counts are the same idea as references in the [memory model](/memory-model/) (a block with no table pointing at it is garbage), and copying only what changes is what a [persistent BST](/persistent-bst/) does with its paths.

```check
Q: A and its fork B share all of their blocks, and A finishes. How many blocks go back on the free list?
- All of A's blocks
* None
- Only A's last block
- Half of them
= Finishing lowers each count from 2 to 1. B still reads every one of them, so none is free.
```

## Block size

Bigger blocks mean shorter tables and fewer pops, and more waste in the last block. In [Big blocks waste more](#example:big-blocks), blocks of 8 hold three requests of 5, 11 and 7 tokens. They use 4 of the 6 blocks and waste 9 of the 32 slots handed out. Switch the block size to 2 and the waste drops to 3 slots, but B's table is now 6 entries long.

Small blocks have a cost on a GPU too. Kwon et al. found that with blocks too small, vLLM cannot use the GPU's parallelism to read the cache, and with blocks too large the waste grows and less can be shared. Their default is 16 tokens.

## Against one contiguous piece

Suppose instead each request gets one piece of 16 slots, the longest a request may get here, the way you would reserve a [dynamic array](/dynamic-array/) at its final capacity. [Six short requests where contiguous memory fits three](#example:many-short) runs six requests of 1 to 4 tokens. Paged, they use 9 of the 12 blocks. Contiguous, they would need 6 × 16 = 96 slots, twice the pool. Only three of them would fit, and the **wasted if contiguous** counter says 69 slots would sit reserved and empty.

Fewer requests in memory means a smaller batch, and a smaller batch means less work per pass over the weights. That is where paging pays: not in speed per token, in how many requests fit at once.

## When the pool runs out

In [The pool runs out and a request waits](#example:out-of-blocks), four requests take 10 of the 12 blocks. Two steps later all 12 are in use. C needs a new block and the free list is empty, so C waits. The next step D waits too. Then B finishes, three blocks go back, and C and D carry on.

Waiting is this toy's rule. vLLM does something harsher: it preempts the newest request, evicts all of its blocks, and later swaps them back in from CPU memory or recomputes them from the tokens.

## When to use it

Use it whenever many requests of unknown length share one memory: a serving system. Paging lets more requests fit, which lets the batch grow (see [continuous batching](/continuous-batching/)), and sharing makes parallel sampling and beam search cheaper.

One request on its own does not need it. Neither does training, where every sequence is known up front.

## Common mistakes

- Thinking blocks must be contiguous. Only the slots inside a block are; the table points anywhere.
- Copying a shared block that is full. Nobody writes into a full block, so it stays shared forever.
- Freeing a shared block when one sample finishes. Lower the count; free it only at 0.
- Forgetting the last writer. With three readers, two copies are made; the last one writes in place.
- Thinking paging removes all waste. It caps it at B − 1 slots per request.
- Counting a shared token twice. The **tokens** counter counts per request; the pool stores it once.

## At real scale

Kwon et al. (SOSP 2023) measured earlier systems that reserve contiguous memory: only 20.4% to 38.2% of the KV cache memory held actual tokens. vLLM keeps the waste of each request within one block, and uses blocks of 16 tokens by default. They report 2 to 4 times the throughput of FasterTransformer and Orca at the same latency. Sharing saved 6.1% to 9.8% of memory for parallel sampling and 37.6% to 55.2% for beam search on their Alpaca trace.

## Try this

- In [Blocks are handed out as tokens arrive](#example:on-demand), predict the step at which B gets its second block. Then step to it.
- Load [Parallel samples share the prompt](#example:fork-shares) and change the prompt to 8 tokens (add 8, then fork A twice). How many copies does the first step make now?
- In [Big blocks waste more](#example:big-blocks), try each block size. Which wastes least, and which makes the longest tables?
- Add 16, 16 and 16. Can you add a fourth request? What does the refusal say, and what would free a block?
- Use **Compare** to run the same requests with sharing on and off, side by side.

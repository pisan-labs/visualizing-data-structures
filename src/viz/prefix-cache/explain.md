# Prefix cache (radix tree)

Prefill, the first pass over a prompt, is expensive for a long prompt: every layer runs over every prompt token to make its keys and values (the [KV cache](/kv-cache/)). A chat sends the whole conversation again at every turn. A hundred requests behind the same system prompt send the same first tokens a hundred times. Why compute those keys and values more than once?

A prefix cache keeps them. Zheng et al. (2024, the SGLang paper) store them in a radix tree, the same structure as a [compressed trie](/compressed-trie/), with tokens where the trie has letters. They call it RadixAttention. A new prompt walks down the tree as far as its tokens match, reuses everything on the way, and prefills only the rest.

On this page a token is a word, and a slot holds one token's keys and values.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| request(prompt) | walk down while the edges match; split an edge where the prompt leaves it; lock the path; evict if needed; prefill the rest and keep it as a new leaf | Θ(n) to match, then n − m tokens of prefill |
| finish(X) | every node on X's path loses one reference; the tokens stay cached | Θ(depth) |
| evict | the least recently used leaf that no running request uses goes, all of it | Θ(L log L) with a heap of the L leaves |

Here n is the prompt's length and m the number of tokens matched. Each edge holds a run of tokens. Each node shows its **reference count**: how many running requests use it. [Show me](#play:shared-start)

## Walking down the tree

Start with [Prompts that start the same way share a path](#example:shared-start). A sends "the cat sat on the mat". The tree is empty, so all 6 tokens are prefilled and hang under the root as one edge.

B sends "the cat sat on the rug". The walk goes along A's edge and matches 5 tokens, then the edge has mat where B has rug. 5 tokens of B are already cached. Only rug is prefilled.

At each node the walk looks for the child whose edge starts with the next token. Children start with different tokens, so there is at most one. A hash map on the first token makes that O(1), and then the tokens along the edge are compared one by one. That is the whole search.

```check
Q: The tree holds one edge, "the cat sat on the mat". A request "the cat ran" arrives. How many of its tokens are cached?
- 0
- 1
* 2
- 3
= the and cat match, then the edge has sat where the request has ran. 2 tokens are reused and 1 is prefilled.
```

## Splitting an edge

B leaves A's edge after 5 tokens, so the edge is split there: a new node for "the cat sat on the", with mat hanging below it, and rug becomes a new leaf next to mat. This is the split of a [compressed trie](/compressed-trie/) insert, one edge at most. Nothing is computed and no key or value moves. The split only changes the index.

Then C sends "the cat ran under the tree" and the edge "the cat sat on the" splits again, after 2 tokens. After three requests the tree holds 11 tokens, and 7 of the 18 prompt tokens came from the cache: a hit rate of 39%.

A prompt can also end inside an edge. In [The same prompt again: only the last token runs](#example:whole-prompt), C sends "the dog chased", and the edge "the dog chased the cat" splits after its third token.

## Reference counts

A request that is running needs its keys and values until it finishes. So when a request matches a path, every node on the path gets one more reference, and a node with a reference cannot be evicted. When the request finishes, the counts go down again. The tokens stay in the tree. That is the point: the next prompt that starts the same way finds them.

In [A running request's tokens are never evicted](#example:running-protected) the cache holds 12 tokens. A is still running when C arrives. C needs 4 slots and only 1 is free. A's leaf "dog saw the ball" was used longest ago, but A is using it, so it stays. B's "a cat sat on the mat" goes instead, all 6 tokens.

If every token belongs to a running request, nothing can go. In [No room: the next request waits for one to finish](#example:waits), A and B hold 11 of the 12 slots, and C needs 2. C waits. Once B finishes, B's 5 tokens may be evicted and C runs.

## Least recently used first

Every node remembers when a request last used it (time ticks once per request or finish here). When room is needed, the leaf with the oldest time among those with no references goes, the way an [LRU cache](/lru-cache/) evicts the entry unused the longest. Only leaves: an inner node is a prefix of something below it, and it becomes a leaf, and a candidate, once its children are gone.

In [A full cache evicts the least recently used leaf](#example:lru-evicts), D needs one slot in a full cache of 12. The leaves are mat (last used at time 2), rug (C is using it) and "ate the ball" (time 4). mat goes.

```check
Q: The leaves are "mat" (used at time 2, no references), "rug" (time 5, one reference) and "ate the ball" (time 4, no references). One slot is needed. What is evicted?
* mat
- rug
- ate the ball
- Nothing: the request waits
= Only leaves with no references may go, and of those mat was used longest ago. rug is newer anyway, and it is in use.
```

A leaf is evicted whole, so a request can free more than it needs: C in the running example needed 3 more slots and freed 6.

## The last token always runs

In [The same prompt again: only the last token runs](#example:whole-prompt), B sends A's prompt word for word. All 5 tokens are cached, and still 1 is prefilled. The cache holds keys and values, not outputs, and the output of the last prompt token is what picks the first new token. So the last token runs once more. 4 tokens are reused.

## When to use it

Use it whenever prompts share beginnings: a system prompt in front of every request, few-shot examples, a chat that resends the conversation at every turn, an agent that calls the model again and again on a growing history. [A chat: each turn starts with the one before](#example:chat-turns) reuses 3 and then 6 tokens, and [Four requests behind one long shared prompt](#example:shared-system-prompt) reuses 21 of 32. That node ends with 4 references.

It does nothing when nothing is shared. [Nothing in common: every token is prefilled](#example:nothing-shared) has a hit rate of 0%, and the tree costs memory and a walk per request for nothing.

The order of requests matters too. Zheng et al. schedule the waiting requests with the longest cached prefix first, so a shared prefix is still in the cache when the requests that need it run.

## Common mistakes

- Thinking the cache stores text. It stores keys and values; the tokens on the edges are only the index.
- Matching a run in the middle of a prompt. A token's keys and values depend on every token before it, so only a prefix can be reused. "the cat" after "a dog and" is not the "the cat" at the start.
- Evicting a node a running request uses. Check the reference count first.
- Evicting an inner node. It is the prefix of the leaves below it; only leaves go.
- Counting a full match as no work. The last token runs again, and the new tokens still attend to all the cached keys.
- Thinking a split copies anything. It only cuts an edge in two.

## At real scale

The toy holds 12 to 24 tokens, each one slot. Llama 2 7B (Touvron et al. 2023) has 32 layers of width 4096, so each token's keys and values are 2 × 32 × 4096 = 262 144 numbers, half a megabyte at 2 bytes each. A shared system prompt of 1000 tokens is about 500 MB of cache, for every request that sends it, unless it is kept once and shared. The tree itself is tiny next to that.

Real systems keep the cached keys and values in pages, as in [paged attention](/paged-attention/). In the SGLang paper a page is one token, like a slot here. vLLM's pages are blocks of several tokens, and its automatic prefix caching finds shared blocks with a hash of each block's tokens and the tokens before it, instead of a tree.

## Try this

- In [Prompts that start the same way share a path](#example:shared-start), predict where each request splits the tree before you step to it.
- Load [A full cache evicts the least recently used leaf](#example:lru-evicts), then finish C and send "a dog sat". What goes now?
- Set the cache to 24 tokens and replay [A running request's tokens are never evicted](#example:running-protected). Does anything get evicted?
- Send "the cat sat on the mat" three times, finishing each. What is the hit rate, and why is it not 100%?
- Use **Compare** to run the same requests with caches of 12 and 24 tokens, side by side.

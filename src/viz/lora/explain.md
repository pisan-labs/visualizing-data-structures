# LoRA (low-rank adapters)

Fine-tuning a big model on your task means changing its weights. All of them, if you do it the obvious way. For a model with billions of weights that is billions of gradients, billions of optimizer states, and a full copy of the model for every task you train. LoRA (Hu et al., 2021) asks for much less. Freeze the weights. Learn only the change, and force the change to be small in a particular way: low rank.

The layer here is a 4 × 4 matrix, so you can see every number. Real layers are thousands wide. The arithmetic is the same.

## The idea

| Step | What it does | Cost for a d × d layer |
|---|---|---|
| freeze | the pretrained W gets no gradient and never changes | 0 |
| adapter | B is d × r, A is r × d, with r much smaller than d | 2dr trained numbers |
| update | ΔW = (α/r)·B·A, and the layer computes with W + ΔW | Θ(d²·r) to form |
| train | gradient steps on B and A only | Θ(dr) optimizer state |
| merge | W' = W + ΔW, once, before serving | Θ(d²·r), then nothing |

D on this page is the target: the update full fine-tuning would make if it trained all 16 numbers of W. LoRA tries to reach it with ΔW. The loss is Σ (ΔW − D)², the squared differences added up. Each press of Train takes 20 steps of Adam, the optimizer the paper trains with, and W never moves. [Show me](#play:rank-one-target)

## How it works

Start with [Rank 1 is enough for a rank-1 update](#example:rank-one-target). D's first row is (−1, 1, −1, 1) and the other three rows are its negative. The adapter has r = 1: B is a column of 4 numbers and A a row of 4, so 8 trained numbers for a 16-number update.

A starts small and random, (−1, 0.6, 0.4, −0.6). B starts at 0. So ΔW = B·A = 0 and the layer starts exactly as it was. The loss is all of D squared: 16.

On the first step only B moves. A's gradient is (α/r)·Bᵀ·2E, and B is all zeros, so A gets no push yet. B's gradient uses A, which is not zero. From the second step on both move. After 20 steps the loss is 0.11, and after 60 it is 0.00. B ends at (0.64, −0.64, −0.64, −0.64) and A at (−1.61, 1.59, −1.59, 1.56). Each entry of ΔW is a number from B times a number from A: row 1, column 1 is 0.64 × −1.61 = −1.03. Close enough to −1.

Notice that B and A are not unique. Double B and halve A and ΔW does not change. Training finds one of many pairs.

```check
Q: r = 1 and α/r = 1. B is the column (2, 0, −1, 1) and A is the row (1, 3, 0, −2). What is ΔW in row 3, column 4?
- −1
* 2
- −2
- 0
= Row 3 of B is −1 and column 4 of A is −2. ΔW = (α/r) · B·A, so the entry is 1 × (−1) × (−2) = 2.
```

## What rank r can say

B·A can never have rank more than r. A rank-1 ΔW is a column times a row, so every row of it is a multiple of the same row. Rank 2 allows combinations of two rows, and so on.

In [Rank 1 cannot reach a rank-2 update](#example:rank-one-falls-short), D's first row is (−1, 2, −2, 1) and the other three are (1, 0, 0, −1). Two directions. A rank-1 ΔW can only make one, so training settles on a compromise: its first row ends at (−1.50, 1.45, −1.45, 1.50) and the others at (0.54, −0.52, 0.52, −0.54). The loss stops at 4.01.

How low could it go? D's squared singular values are 12 and 4. The best a rank-r matrix can do is to keep the r largest and lose the rest (Eckart and Young, 1936), so rank 1 cannot beat 4.00. The page shows this floor as **best loss at rank r**. Training got to within 0.01 of it.

Give the same D an adapter of rank 2 in [Rank 2 reaches a rank-2 update](#example:rank-two-reaches) and the loss goes 16, 0.79, 0.11, 0.02 after 0, 20, 40 and 60 steps. And in [A full-rank update, a rank-2 adapter](#example:full-rank-target), D has rank 4: the floor is 5.33, and training stops at 5.36.

So the whole bet of LoRA is that the update a task needs has low rank. Hu et al. found it often does. In their rank study on GPT-3 (two tasks, WikiSQL and MultiNLI), rank 1 on the query and value weights did about as well as rank 64. They also say plainly that they do not expect a small r to work for every task.

```check
Q: A layer's W is 4096 × 4096 and LoRA uses r = 8. How many numbers does the adapter train?
- 4096 + 8
- 32 768
* 65 536
- 16 777 216
= B is 4096 × 8 and A is 8 × 4096: 2 × 4096 × 8 = 65 536. Full fine-tuning would train 4096² = 16 777 216, so the adapter is 0.39% of that.
```

## Where B and A start

The paper starts A random (Gaussian) and B at zero. Both choices matter.

B = 0 means ΔW = 0, so the model starts exactly as pretrained. Change the start to [Both start random: the layer starts changed](#example:both-random) and ΔW is not zero before any training. Its first entry is −0.6 × −1 = 0.60. The loss starts at 18.81, worse than the 16 of doing nothing. Here it recovers, but in a real model a random ΔW in every layer is noise added to a model that worked.

A random means B gets a gradient. Start both at zero, as in [Both start at zero: stuck forever](#example:both-zero), and each gradient is multiplied by the other matrix, which is 0. Nothing moves. The loss stays at 16 for as many steps as you like. It is the same trap as a two-layer network with both layers set to zero: [backpropagation](/backpropagation/) multiplies each layer's gradient by the other layer's weights, and gets 0.

## The scale α/r

ΔW is multiplied by α/r. The paper's advice: set α to the first r you try, then leave it alone, so that trying a different r does not mean tuning the learning rate again. With Adam, they note, changing α is about the same as changing the learning rate.

You can see that in [A large α: the first step overshoots](#example:alpha-large). With α = 8 and r = 1, B's first Adam step is the same size as always, but its effect on ΔW is 8 times larger. The loss goes up on step 1, from 16.00 to 16.97. After that, training simply grows a smaller B: it ends at about 0.08 per entry instead of 0.64, and the loss is 0.01 after 60 steps. Too large an α behaves like too large a learning rate; the [gradient descent](/gradient-descent/) page has those in slow motion.

## Merging for serving

During training the layer computes x·W + (x·B)·A·(α/r). Note the brackets. x·B is only r numbers, so the side path costs 2dr multiply-adds per input. Computing x·(B·A) instead would form a d × d matrix for every input: the order of a matrix product matters, as on the [matrix-chain](/dp-matrix-chain/) page.

For serving you can do better than a side path: add ΔW into W once. In [Merge the adapter into W for serving](#example:merge-for-serving), W's first row (0, .1, .2, .2) plus ΔW's (−1.03, 1.01, −1.01, .99) becomes (−1.03, 1.11, −.81, 1.19). The layer is one 4 × 4 matrix again, 16 multiply-adds per input instead of 24. No extra latency at all. To switch tasks, subtract ΔW and add another adapter's.

The catch, which the paper points out: once merged, one batch cannot easily mix inputs for different tasks. Unmerged adapters can, at the price of the side path.

## When to use it

Use LoRA when you want to adapt one big model to many tasks and cannot afford a full copy, or full optimizer state, for each. The frozen W can even be stored in 4 bits: QLoRA (Dettmers et al., 2023) trains 16-bit adapters on top of a [quantized](/quantization/) model, which is how it fine-tunes a 65-billion-parameter model on one 48 GB GPU.

Avoid it when the task is far from what the model learned, a new language say. The update may need a high rank, and the paper itself expects full fine-tuning to win there. At toy sizes it saves nothing: here, rank 2 already trains as many numbers as W has. LoRA pays when r is tiny next to d.

Hu et al. adapted only attention weights, W_Q and W_V in [self-attention](/self-attention/). QLoRA found it needed adapters on every linear layer of the [transformer block](/transformer-block/) to match full fine-tuning.

## Common mistakes

- Starting B and A both at zero. Nothing ever trains.
- Starting both random. The model is changed before it has learned anything.
- Forgetting α/r. Change r without it and the size of the update changes too.
- Computing x·(B·A) for every input. Compute (x·B)·A, or merge.
- Merging twice. W + 2ΔW is not the model you trained.
- Expecting rank 1 to learn anything. It learns the best rank-1 piece of the update; watch **best loss at rank r**.
- Counting the savings at toy size. At d = 4 and r = 2 there are none; at d = 4096 and r = 2 the adapter is 0.1% of W.

## At real scale

Hu et al. (2021) applied LoRA to GPT-3 175B, whose layers are 12 288 wide. Compared with full fine-tuning with Adam, it cut the trained parameters by about 10 000 times and the GPU memory by 3 times: 350 GB during training instead of 1.2 TB. With r = 4 on only the query and value matrices, a task's checkpoint is about 35 MB instead of 350 GB. Training was also about 25% faster, since most gradients are never computed. The toy here has one 4 × 4 layer.

## Try this

- [Rank 1 is enough for a rank-1 update](#example:rank-one-target): before you step, which of B and A will change on step 1?
- In [Rank 1 cannot reach a rank-2 update](#example:rank-one-falls-short), raise the rank to 2 and train again. Where does the loss end?
- Type your own D: `1 2 0 0 2 4 0 0 0 0 0 0 0 0 0 0`. What rank is it, and what does rank 1 do with it?
- Try the identity, `1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1`, with r = 1, 2, 3 and 4. Can you predict each floor before you train?
- In [Merge the adapter into W for serving](#example:merge-for-serving), press Train after the merge. What happens to the merged W?

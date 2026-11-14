# Recurrent networks (RNN and LSTM)

Before transformers, a network read a sentence the way you do: one word at a time, left to right, carrying a memory from each word to the next. That is a recurrent network. Its memory is a vector, the hidden state h, and every word rewrites it. The trouble is what happens to the first word by the time you reach the tenth. In a plain RNN it fades, and worse, training cannot tell the network to hold on to it. The LSTM fixed that with a cell and three gates.

The memory on this page is one number, made by hand to mean "an animal". Only an animal writes to it. So you can watch one word, cat, travel down the sentence and see how much of it arrives.

## The idea

| Step | What it does | Cost per word |
|---|---|---|
| RNN step | h_t = tanh(w·h_{t−1} + x_t·U): what is left of the old memory, plus what the word brings, squashed into −1 to 1 | Θ(d · (d + m)) |
| LSTM step | three gates and a candidate decide what the cell c keeps, what it writes and what it shows | Θ(d · (d + m)), four times over |
| pull of word 1 | ∂m_t/∂m_1: how much a nudge to the memory after word 1 still moves it now | one multiply per word |

Here d is the width of the memory (1 here) and m the width of a word's vector (4 here: animal, thing, action, small). W is 1 × 1, a single number w. The words come from the toy vocabulary the other AI pages share. [Show me](#play:rnn-fades)

## The plain RNN

Start with [The plain RNN forgets the cat](#example:rnn-fades): cat sat on the mat and it slept. U reads only the animal feature, so cat brings 1 and every other word brings 0. After cat, h = tanh(0 + 1) = 0.76.

At sat, the old memory times w is 0.8 × 0.76 = 0.61, and sat adds nothing. h = tanh(0.61) = 0.54. Then 0.41, 0.32, 0.25 and so on. Every word that is not an animal multiplies the memory by w and squashes it. By slept, h is 0.12. The network has mostly forgotten that there was a cat.

```check
Q: A plain RNN with w = 0.8 has h = 0.50. The next word is "the", which brings x·U = 0. What is the new h?
- 0.40
* 0.38
- 0.50
- 0.46
= h = tanh(0.8 × 0.50 + 0) = tanh(0.40) = 0.38. Nothing new comes in, so the memory shrinks.
```

Fading memory is one problem. The bigger one is learning. Suppose the network should have kept the cat. Training finds out by [backpropagation](/backpropagation/) through time: unroll the network, one copy per word, and run the chain rule backwards from the last word to the first. The chain rule multiplies. Each step back multiplies the gradient by that step's slope, w · (1 − h²): w from the multiplication, 1 − h² from tanh.

The last column on the page, ∂h/∂h₁, is that product. At sat the slope is 0.8 × (1 − 0.544²) = 0.56. By slept, seven slopes later, the product is 0.096. With [a smaller w](#example:small-weight) of 0.5 it is 0.0065. Each slope is below 1, so the product falls off exponentially with the distance. This is the vanishing gradient (Bengio, Simard and Frasconi 1994). The network gets almost no signal about word 1, so it never learns to keep it.

A bigger w does not save you. [A latch that cannot learn](#example:latch) uses w = 1.5. Now the RNN holds on: h climbs to 0.86 and stays there. But tanh is flat out there, 1 − 0.86² is 0.26, and every slope is about 0.4. The pull is 0.0023 by slept, worse than with w = 0.8. Remembering and learning to remember are not the same thing. Bengio et al. showed this trade-off in general: the conditions that let a network latch on to information for a long time are the ones that make its gradients vanish.

## The LSTM

Hochreiter and Schmidhuber (1997) gave the network a second memory, the cell c, that is updated by adding instead of by squashing:

c_t = f_t · c_{t−1} + i_t · g_t

The forget gate f says how much of the old cell to keep. The input gate i says how much of the candidate g to write. Both are sigmoids, between 0 and 1. Then the output gate o decides how much of the cell to show: h_t = o_t · tanh(c_t).

[The LSTM keeps the cat](#example:lstm-keeps) runs the same sentence. The hand-made gates read the animal feature. At cat, f = σ(−6 + 3) = 0.05 (let go of any old animal), i = σ(6 − 3) = 0.95 and g = tanh(2) = 0.96, so c = 0.05 × 0 + 0.95 × 0.96 = 0.92. Every word after that has f = 0.95 and i = 0.05 with g = 0: keep the cell, write nothing. At slept the cell still holds 0.65.

Now the pull. Going back through the cell, a step multiplies the gradient by f and nothing else. No tanh slope. So the pull at slept is 0.95⁷ = 0.71, against 0.096 for the plain RNN. A forget gate near 1 is a path the gradient can travel without fading. That is the whole trick.

```check
Q: Over 20 words, an LSTM's forget gate is 0.95 at every word. About how much of word 1's pull is left?
* About 0.36
- 0.95
- About 0.001
- 0, it has vanished
= The pull is the product of the forget gates: 0.95²⁰ ≈ 0.36. A plain RNN with slopes of 0.5 would be at 0.5²⁰, about one in a million.
```

The output gate here opens for verbs (σ(4 × action − 2)). So h, what the next layer sees, shows the cat at sat (0.62) and at slept (0.48), and much less in between. The cell keeps the memory; the output gate decides when to use it.

In this hand-made cell the gates look only at the current word (their weights on h are 0), so the cell is the only path back and the product is exact. A trained LSTM's gates also look at h_{t−1}, which adds more paths. The cell path is still the one that does not fade.

## The forget gate

The 1997 LSTM had no forget gate. Its cell was c_t = c_{t−1} + i_t · g_t, so the pull was exactly 1 forever. Perfect memory sounds good. [Without a forget gate the cell only grows](#example:no-forget-gate): cat saw a dog and a fox puts 0.92 into the cell, then 1.80, then 2.72. Nothing ever leaves. On a long stream of text with no clear start and end, the cell fills up with stale stuff. Gers, Schmidhuber and Cummins (2000) added the forget gate so the cell can reset itself.

[A new animal: the forget gate lets go](#example:new-animal) shows it working. In cat sat and the dog ate it, the cell holds the cat until dog shuts the forget gate (0.08) and writes the dog in. The pull of word 1 drops from 0.86 to 0.07. That is not the vanishing gradient. It is the network deciding the cat no longer matters.

## What transformers replaced

Two things, and they are the same chain seen from two sides.

First, speed. The memory after word t needs the memory after word t − 1, so a sentence of n words is n steps in a row, even in training, when every word is known in advance. [One word at a time](#example:step-by-step) is the only way an RNN can go. [Self-attention](/self-attention/) computes every position at once, which is what GPUs are good at. Vaswani et al. (2017) dropped recurrence entirely for that reason.

Second, distance. In an RNN, word 1 reaches word n only through n − 1 steps, and everything it says has to fit in one fixed-size state. In attention, word n looks at word 1 directly: one step, whatever the distance.

The price moves elsewhere. When a transformer generates, it still goes one token at a time, and its memory is the [KV cache](/kv-cache/), a row of keys and values per token that grows with the text. An RNN's state stays the same size however long the text gets. That is why recurrent ideas keep coming back: state-space models such as Mamba (Gu and Dao 2023) keep a fixed-size state per layer like an RNN, and are built so training can still run over the whole sequence at once.

## When to use it

An RNN or LSTM is a reasonable choice for streams that never end and must be processed as they arrive (sensor data, audio on a small device), where memory per step has to stay fixed. A GRU (Cho et al. 2014) is a lighter cousin with two gates and no separate cell. For language at any scale, transformers won: they train in parallel, and attention reaches back further than an LSTM's cell does in practice.

## Common mistakes

- Thinking the vanishing gradient means the forward memory is gone. [The latch](#example:latch) keeps h at 0.86; it is the gradient that vanishes.
- Making w bigger to fix it. Past a point tanh saturates and the slopes shrink again. If the slopes stay above 1, the product explodes instead (people clip the gradient to survive that).
- Reading a forget gate of 1 as "the LSTM never forgets". The 1997 cell did that, and it was a problem. A low forget gate is often the right call.
- Mixing up c and h. The cell c is the long-term memory; h is what the output gate lets out at this step.
- Confusing the letters. This page writes w (W) for the recurrent weights and U for the input weights; SLP3 swaps them. Check each book's definition.
- Expecting an LSTM to remember forever. A forget gate of 0.95 is 0.36 after 20 words and 0.006 after 100. Better than a plain RNN, not infinite.

## At real scale

Hochreiter and Schmidhuber (1997) reported LSTMs bridging time lags of more than 1000 steps on synthetic tasks a plain RNN could not learn. Sutskever, Vinyals and Le (2014) translated with 4 layers of LSTM, 1000 cells per layer and 384 million parameters. Google's translation system (Wu et al. 2016) used 8 LSTM layers in the encoder and 8 in the decoder. The transformer of Vaswani et al. (2017) beat those results, and its base model trained in 12 hours on 8 GPUs, because no step waited for the one before. Same goal, different shape: one memory of width 1000 against a cache that remembers every token.

## Try this

- [The plain RNN forgets the cat](#example:rnn-fades): load "cat sat" and read both words. What is the pull after two words, and why is it the same with any sentence that starts like that?
- Switch [The LSTM keeps the cat](#example:lstm-keeps) to the plain RNN with w = 1.5. Which is bigger at slept, h or the pull?
- Load "the box sat on the mat". Why does nothing happen in the memory?
- In [A new animal](#example:new-animal), replace dog with "the". How much of the cat is left at the end?
- Find the forget gate for "saw" (its animal feature is 0.1). Why is it a little lower than for "sat"?

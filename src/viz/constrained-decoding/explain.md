# Constrained decoding with a DFA

Ask a language model a yes-or-no question and it may well say "yeah". Fine for a person, useless for a program that expects yes or no. The same goes for a date, a number, a field of JSON. You can ask the model nicely and check what comes back. Or you can make it impossible for the model to write anything else.

Constrained decoding does the second. Write what is allowed as a regular expression, compile it to a DFA, and at every step let the model choose only among the tokens that keep the text on a path to a match. Everything else gets a logit of −∞ before the softmax. Willard and Louf (2023) showed how to do it fast, by building an index from each DFA state to its allowed tokens once, and released it as the Outlines library. The model itself never changes. It still has no idea there is a regex.

The model here is a toy that scores the next token from the one before it, with made-up logits, and it has been told to answer yes or no. Its vocabulary has 14 tokens: </s>, yeah, yes, ye, y, e, s, no, n, o, haha, ha, h and a.

## The idea

| Step | What it does | Cost |
|---|---|---|
| compile | regex → Thompson's NFA → subset construction → minimal DFA, dead state dropped | Θ(m) to Θ(2^m) |
| index | for every state q and token t, walk t's letters from q; σ(q) is the tokens that never fall off | Θ(\|Q\| · Σ\|t\|), once per regex |
| mask | logits of tokens not in σ(q) become −∞ | Θ(V) per step |
| choose | softmax over what is left; greedy, or draw with u | Θ(V) per step |
| move | the DFA goes to where the token ends; stop at </s> | Θ(1) with the index |

V is the number of tokens, Σ\|t\| their letters in all, and m the length of the regex. [Show me](#play:yes-or-no)

## From the regex to a DFA

This part is the classic one, and it has pages of its own: [Thompson's construction](/regex-to-nfa/) turns yes|no into an NFA with 12 states, the [subset construction](/nfa-to-dfa/) makes it a DFA with 7, and [minimizing](/dfa-minimization/) leaves 6. One of those is the dead state, the state you fall into after a wrong letter and never leave. Drop it, and a missing move means "this letter would break the match", as on the [DFA page](/dfa/). Five states are left: q0, then q2 after y, q4 after ye, q1 after n, and q3, which accepts.

Every state left can still reach q3. That matters: a token that stays on the DFA can always be finished into a match, so the model can never write itself into a corner. Almost: some token also has to spell the letters still needed, and [A letter no token has](#example:stuck) shows what happens when none does.

## Tokens cross several moves

The DFA reads letters; the model writes tokens. So the index walks each token letter by letter. From q0, yes reads y, e and s and ends in q3: one token, three moves. yeah reads y and e, then a has no move from q4, so yeah is masked. no ends in q3, n in q1. In [The index, built once](#example:build-index), σ(q0) is yes, ye, y, no and n, and every other state allows one token: q1 only o, q2 only e, q4 only s, and q3, which accepts, only </s>. Building it takes 71 lookups. After that, each step reads one row. [Show me](#play:build-index)

```check
Q: In the DFA for yes|no, the text is "y" (state q2). Which tokens does σ(q2) allow?
- yes and ye
- e and es
* e only
- e and s
= From q2 the only move is on e. The vocabulary has no es token, and s has no move from q2, so e is the one token that stays on the DFA.
```

The same walk handles loops. For (ha)+, haha from q0 reads h, a, h, a and goes round the loop once, ending in the accepting state.

## Masking and choosing

At q0 the model's logits are yeah 3, yes 2.4, no 2, ha 1.6 and smaller ones. Without the mask, softmax gives yeah 0.34 and greedy writes yeah, then </s>. [Without the mask: yeah](#example:no-mask) ends with "yeah", which yes|no does not match.

With the mask, the nine tokens outside σ(q0) get −∞, and e to the minus infinity is 0. Softmax over the five left: yes 0.45, no 0.30, ye 0.11, and y and n the rest. Greedy takes yes, the DFA moves to q3, where only </s> is allowed, and the text is "yes". [Asked yes or no, it says yes](#example:yes-or-no). The probabilities of the allowed tokens keep their order and their ratios; they are just scaled up to add up to 1.

```check
Q: After the mask only two tokens are left, with logits 2 and 1. What probability does the first get?
- 0.50
- 0.67
* 0.73
- 1.00
= Softmax over what is left: e² / (e² + e¹) = e / (e + 1) = 0.73. The masked tokens add e^(−∞) = 0 to the total.
```

Sampling works the same way on the masked distribution. [Laughter, sampled three times](#example:laugh) writes haha three times: twice as the single token haha, once as h a h a. The mask allows all of those spellings; the model chooses among them.

## Build once, or check every step

The other way is to walk every token from the current state at every step. Same mask, no index. In [Walking every token at every step](#example:scan), the three laughs cost 145 lookups, 13 to 17 per step, against 47 for building the index once in [the sampled laughs](#example:laugh). For one short answer, checking on the fly can be cheaper than the whole index. But the index is built once per regex and reused for every request and every step, while the walk is paid again each time. With 50 000 tokens, walking them all at each step is what you cannot afford.

## When the regex and the model disagree

- [When the model already obeys](#example:agree): ye(s|ah) allows yeah, so the mask removes only tokens the model did not want anyway, and the text is "yeah" with or without it.
- [A token the model barely likes](#example:forced): for yo+, q0 allows only y, and after y the model's favourite, e, is masked. Only o is left, so o gets probability 1, however low its logit.
- [A letter no token has](#example:stuck): yet needs a t, and no token has one. After ye, nothing is allowed and decoding is stuck. Byte-level vocabularies, like GPT-2's, have a token for every byte, so this cannot happen there.

## When to use it

Use it whenever a program will read the output: a choice from a list, a number, a date, JSON that must parse. The output is guaranteed to match, and it costs one lookup and one mask per step once the index is built.

Avoid leaning on it to make answers right. The mask makes the text well formed, not true: asked a question it gets wrong, the model will now get it wrong in valid JSON. And a tight mask can push the model into token splits it rarely saw in training (h a h a), where its predictions are worse.

## Common mistakes

- Masking by letters instead of tokens. The model writes tokens; one token can cross several moves, or fall off halfway.
- Allowing a token that ends in a state that cannot reach an accepting state. Drop the dead state, so that every state left can still finish a match.
- Allowing </s> anywhere. The end token is allowed only in an accepting state.
- Setting masked logits to 0 instead of −∞. A logit of 0 is a real score, and the token can still be chosen.
- Renormalizing by hand after the softmax. Softmax over the masked logits already gives allowed tokens that add up to 1.
- Building the index at every step. It depends only on the regex and the vocabulary.

## At real scale

Real vocabularies are large: GPT-2 (2019) has 50 257 tokens, so each state's row has that many entries, and a regex whose DFA has a hundred states needs about 5 million token walks to index, once. Willard and Louf (2023) build that index ahead of time so that each step of decoding costs a lookup rather than a pass over the vocabulary, and they extend the same idea from regular expressions to context-free grammars, for formats like JSON. The toy here has 14 tokens and DFAs of a handful of states.

## Try this

- [Asked yes or no, it says yes](#example:yes-or-no): turn the mask off and generate again. What does the model write?
- Compile (yes|no)+ and generate. Why does it stop after one answer?
- [Laughter, sampled three times](#example:laugh): switch to greedy. Which spelling of the laugh does it pick?
- [Walking every token at every step](#example:scan): generate ten more times. When does the index start to pay for itself?
- Compile n?o+ and press Index. Which state allows the most tokens, and why?
- [A letter no token has](#example:stuck): which regex over these letters gets stuck the same way?

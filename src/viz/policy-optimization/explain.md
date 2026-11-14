# Policy optimization (PPO, GRPO, DPO)

A pretrained model knows how text goes on. It does not know which answer you wanted. Policy optimization is the step after: let the model answer, score the answers, and make the good ones more likely. The model is the policy, π. Its answers come from [sampling](/sampling/), and each update is a step of [gradient descent](/gradient-descent/) (uphill, on the reward). Everything else is in how the score is turned into a step.

The toy here has one prompt, "What is the capital of Australia?", and four answers: Canberra, Sydney, Melbourne and "not sure". The policy is a softmax over four logits z. It starts as the reference policy π_ref: Canberra 0.30, Sydney 0.40, Melbourne 0.20, not sure 0.10. So it is usually wrong. A reward model scores the answers 1, 0.3, 0.2 and 0.5 (an honest "not sure" beats a confident wrong city). Real answers are paragraphs of tokens; here each one is a single choice, so you can follow every number with a calculator.

## The idea

| Method | What an answer's score is | Models held in training | Cost of a step |
|---|---|---|---|
| REINFORCE | its reward | policy, reference, reward model | Θ(G · V) |
| PPO | reward minus what a critic expected; clipped | policy, reference, reward model, critic | Θ(K · G · V) |
| GRPO | reward against the rest of its group; clipped | policy, reference, reward model | Θ(K · G · V) |
| DPO | no score: which of two answers people preferred | policy, reference | Θ(V) |

G is the size of a group of answers (4 here), V the number of answers (4; in a real model, the vocabulary at every token) and K the passes over each group (2 here). Every method also pays to draw its answers, which in a real model is most of the time. [Show me](#play:grpo-step)

## One step, the plain way

The policy gradient (Williams, 1992) says: to make answer a more likely, add to every logit z_k the amount A·(1[a = k] − π_k). A is the answer's score, its advantage. So a drawn answer's own logit goes up by A(1 − π_a) and every other logit goes down by A·π_k. Draw a group of G answers, average their pushes, multiply by the learning rate η (0.5 here), and that is the step.

REINFORCE uses the raw reward as A. Try [Raw rewards push up every answer drawn](#example:reinforce-raw): the group happens to be Melbourne three times and Sydney once. Every reward is positive, so every sample pushes its own answer up. Melbourne goes from 0.20 to 0.21 and Canberra, the right answer, drops from 0.30 to 0.29. On average REINFORCE still heads the right way. But it gets there by luck and averaging, one noisy step at a time.

## PPO: a baseline and a clip

The fix for raw rewards is a baseline: score an answer by how much better it was than expected. PPO (Schulman et al., 2017) keeps a second network, the critic, that predicts the reward, and uses A = reward − V. Here the critic is one number and moves halfway to each group's average. In [PPO: the critic learns what to expect](#example:ppo-run) it goes from 0 to 0.72 in ten steps, and by then only an answer better than 0.72 gets pushed up.

PPO also reuses each group for several passes, which is cheaper than drawing new answers. The danger is overdoing it. So from the second pass on it looks at the ratio ρ = π(a)/π_old(a), how much more likely an answer is now than when it was drawn. Once ρ leaves 1 ± ε in the direction the advantage pushes, the sample adds nothing. In [The clip stops a second push](#example:ppo-clip), the first pass lifts Canberra from 0.30 to 0.38 and its ratio is 1.26. With ε = 0.2 that is past 1.2, so the three Canberra samples sit out the second pass. The Sydney sample has a ratio of 0.86 but a positive advantage, so it still counts: the clip only stops a push that has already gone far enough.

```check
Q: A sample with advantage +0.8 was drawn at π_old = 0.30. After the first pass π = 0.39. With ε = 0.2, does the second pass learn from it?
- Yes, its advantage is positive
* No: its ratio is 1.3, above 1.2, and its advantage pushes it up
- Yes, but only half as much
- No: nothing counts in a second pass
= ρ = 0.39 / 0.30 = 1.3. The advantage wants it higher, and it is already more than 20% higher, so the clip takes it out.
```

## GRPO: the group is the baseline

A critic as large as the policy is expensive. GRPO (Shao et al., 2024) drops it: draw a group of answers to the same prompt and grade each one against the others, A = (reward − mean) / std. [GRPO: one group, step by step](#example:grpo-step) draws Sydney, Canberra, Sydney, Melbourne with rewards 0.3, 1, 0.3, 0.2. The mean is 0.45 and the standard deviation 0.32, so the advantages are −0.47, +1.72, −0.47 and −0.78. Better than the group goes up, worse goes down.

The advantages always add up to 0, so the −A·π parts cancel. In the first pass of this first step the KL term is 0 too (π is still π_ref), and each logit moves by η/4 times its own advantages: Canberra 0.5 × 1.72 / 4 = +0.21, Sydney 0.5 × (−0.94) / 4 = −0.12, Melbourne −0.10, "not sure" (not drawn) 0. The second pass clips Canberra (ratio 1.23), and after one step Canberra is the favourite at 0.39. [Ten steps](#example:grpo-run) take it to 0.89.

```check
Q: A group of four answers gets rewards 1, 0, 0, 0. What is the first answer's GRPO advantage (the standard deviation divides by 4)?
- 0.75
* 1.73
- 1
- 3
= The mean is 0.25 and the standard deviation √((0.75² + 3 × 0.25²) / 4) = 0.43. So (1 − 0.25) / 0.43 = 1.73.
```

The group has a blind spot. If every answer in it gets the same reward, every advantage is 0 and the step does nothing: see [Equal rewards teach GRPO nothing](#example:all-equal). That bites when the good answer is rare. In [A good answer the policy rarely gives](#example:rare-answer) only "not sure" is rewarded, and the policy gives it 10% of the time. Half of the ten groups never draw it (or draw nothing else), and teach nothing. It still climbs from 0.10 to 0.36, slowly. A model cannot learn from an answer it never gives.

## The KL leash

Push long enough and the policy puts everything on one answer, forgets how to say anything else, and finds whatever the reward model happens to like too much. So every method adds a penalty for drifting from the reference, β times the KL divergence KL(π ‖ π_ref). REINFORCE and PPO take it off the reward: r − β·log(π(a)/π_ref(a)). GRPO adds it to the loss instead, so it does not get mixed into the group's mean.

In [A heavy KL weight keeps the policy near the start](#example:kl-leash), β = 1. After ten steps Canberra is at 0.64, against 0.89 with β = 0.1, and ten more steps only bring it to 0.70. The KL readout tells you how far you have wandered: 0.35 there, 0.78 for the ten steps at β = 0.1.

## DPO: preferences, no rewards

DPO (Rafailov et al., 2023) starts from a neat fact: the best policy under a KL leash is π ∝ π_ref·e^(r/β), so a reward can be read off a policy, r = β·log(π/π_ref) plus a constant. Then you never need a reward model at all. Take pairs of answers where people preferred one, y_w over y_l, and train the policy so that its implied reward agrees.

On logits it is short. With h = β[(z_w − z_ref,w) − (z_l − z_ref,l)], the winner's logit goes up and the loser's down by η·β(1 − σ(h)). In [DPO: one preference, no reward model](#example:dpo-pairs) the pair is Canberra over Sydney, both still at the reference, so h = 0 and σ(h) = 0.5: each moves by 0.5 × 0.5 × 0.5 = 0.125. As the policy grows sure, σ(h) heads to 1 and the steps shrink. [Twenty preferences](#example:dpo-run) bring Canberra to 0.71. No answer was drawn from the policy, and no reward was ever seen.

In DPO, β is the leash: the loss is happy once h is large, and with a small β the gap between winner and loser has to grow larger before it is. With plain gradient steps, as here, a small β also makes small steps; real training uses Adam, which mostly takes that scale out.

## When to use which

GRPO suits answers that can be checked (a math answer, a program that passes its tests): no critic to train, and a group is natural when you draw several answers per prompt anyway. PPO is the classic; the critic costs memory, but it gives a baseline for every prompt and, in a real model, every token. DPO is the cheapest: no sampling during training, no reward model, two models in memory. The price is that it only learns from the pairs it is given, which came from some other model.

REINFORCE with raw rewards is mainly a way to see why the others exist.

## Common mistakes

- Using raw rewards with no baseline. Every positive reward pushes its answer up, wrong or right. [Show me](#play:reinforce-raw)
- Expecting the clip to stop every big change. It stops a sample only when its ratio has moved the way its advantage pushes.
- Thinking the clip matters on the first pass. The ratio is 1 there; it only bites when a group is reused.
- Feeding GRPO groups with no spread. Equal rewards give zero advantages. Easy prompts (always right) and impossible ones (always wrong) teach nothing.
- Turning β down to 0 to learn faster. The policy drifts as far as the reward lets it, and the reward model is only a model.
- Reading DPO's β as a learning rate. It sets how far the policy may move from the reference.

## At real scale

Answers are sequences of hundreds of tokens, so π(answer) is a product of token probabilities, and PPO and GRPO compute their ratios and clips token by token. InstructGPT (Ouyang et al., 2022) trained a reward model on human comparisons and then the policy with PPO, with a KL penalty to the supervised model. DeepSeekMath (2024), where GRPO was introduced, drew 64 answers per question and used a KL weight of 0.04; DeepSeek-R1 (2025) used GRPO too. Schulman et al. found ε = 0.2 the best of the clip values they tried, and it is still the usual default. The toy has four answers and one prompt. A real run has many thousands of prompts, and a vocabulary of tens of thousands of tokens (50 257 in GPT-2) at every step of every answer.

## Try this

- [GRPO: one group, step by step](#example:grpo-step): before Pass 2, predict which samples are clipped. Then set ε to 0.3.
- Switch [Raw rewards](#example:reinforce-raw) to GRPO. Does Melbourne still go up?
- Set the rewards to "1 0 0 0" (a checker: right or wrong) and run GRPO, then PPO. Which gets to Canberra first?
- In [A heavy KL weight](#example:kl-leash), set β to 0 and run 20 steps. How high does the KL go?
- [DPO](#example:dpo-run) with β = 0.1 and then 1: which moves faster here, and which would stay closer to the reference with Adam?

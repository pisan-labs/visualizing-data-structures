# Gradient descent (momentum, Adam)

Training a model is a search for the bottom of a valley. The loss is the height, the weights are where you stand, and [backpropagation](/backpropagation/) tells you which way is uphill. Gradient descent does the obvious thing: take a step the other way, and repeat. Almost everything interesting is in how big the step is.

The curves on this page have one or two variables, so you can see the whole landscape. A language model has billions. The arithmetic is the same, one coordinate at a time.

## The idea

| Method | One step | Extra memory per weight |
|---|---|---|
| plain | x ← x − η·g | none |
| momentum | v ← β·v − η·g, then x ← x + v | 1 (the velocity) |
| Adam | average g and g², then step by η·m̂ / (√ŝ + ε) | 2 (the two averages) |

g is the gradient where you stand and η the learning rate. Each step costs Θ(d) for d weights, plus the cost of the gradient itself, which is one backward pass. [Show me](#play:converge)

## The learning rate

Take f(x) = x². The slope is 2x, so a step takes x to x − η·2x = (1 − 2η)·x. Everything depends on that factor.

- [Too small: it crawls](#example:crawl). With η = 0.01 the factor is 0.98. After 50 steps f has gone from 9 to 1.19, and after 200 it still has not converged.
- [Just right: it converges](#example:converge). With η = 0.1 the factor is 0.8, and after 29 steps the slope is under 0.01, where the page calls it converged.
- [Exactly too large: it bounces](#example:bounce). With η = 1 the factor is −1. x goes 3, −3, 3, −3, forever, and f stays at 9.
- [Too large: it diverges](#example:diverge). With η = 1.1 the factor is −1.2. Every step overshoots by more than the last, and the run leaves the chart after 10 steps.

η = 0.5 is the sweet spot here: the factor is 0, and one step lands on the bottom. In general, on a bowl whose curvature (second derivative) is L, plain gradient descent converges exactly when η < 2/L. For x², L = 2.

```check
Q: Plain gradient descent on f(x) = x², from x = 2 with η = 0.25. Where is x after one step?
- 1.5
* 1
- 0
- −1
= The slope at 2 is 2x = 4, and the step is −η × 4 = −1. Or use the factor: (1 − 2 × 0.25) × 2 = 1.
```

## A long, narrow bowl

Real losses are not round. In f(x, y) = (x² + 10y²)/2 the walls across the valley are ten times steeper than the slope along it. The gradient is (x, 10y), which points mostly at the nearest wall, not at the bottom.

[A narrow bowl: the zigzag](#example:zigzag) uses η = 0.19. Across the valley, y is multiplied by 1 − 10η = −0.9 each step, so it bounces from wall to wall and settles slowly. Along the valley, x is multiplied by 0.81 and walks steadily in. 66 steps. Now try [η = 0.21](#example:narrow-diverge): y's factor becomes −1.1 and the run diverges after 19 steps, even though x was doing fine.

So the steepest direction sets the largest learning rate you can use, and the flattest direction sets how many steps you need. The ratio of the two curvatures is the condition number, κ (10 here). With the best fixed η, plain gradient descent needs about κ·log(1/ε) steps to get within ε. In one dimension you could find the bottom with [ternary search](/ternary-search/) instead. In a billion dimensions, nope.

```check
Q: On f(x, y) = (x² + 10y²)/2, what is the largest learning rate for which plain gradient descent still converges?
- Just under 2
- Just under 1
* Just under 0.2
- Just under 0.02
= The curvature across the valley is 10, and gradient descent converges only when η < 2/10. Along the valley the limit would be 2, but the steep direction diverges first.
```

## Momentum

Picture a heavy ball rolling down the valley instead of a careful walker. The velocity keeps β of itself every step and adds the new downhill push: v ← β·v − η·g, then x ← x + v. Along the valley the pushes agree and the ball speeds up. Across it they alternate and cancel. Polyak called it the heavy-ball method (1964).

In [Momentum damps the zigzag](#example:momentum-valley), η = 0.1 and β = 0.5 reach the bottom of the narrow bowl in 19 steps. Plain gradient descent's best on the menu, η = 0.15, takes 37. With well-chosen η and β on a bowl like this, momentum needs about √κ·log(1/ε) steps instead of κ·log(1/ε).

The velocity also carries the ball over small humps. In [Stuck in the nearer valley](#example:local-minimum), plain gradient descent from x = 2.5 settles in the right-hand valley at f = −0.59 after 9 steps. The deeper valley to the left, at f = −1.43, never gets a look. [Momentum rolls over the hump](#example:momentum-escapes) with η = 0.05 and β = 0.9 and ends up in the deeper one. Not always: with η = 0.1 it oscillates around the near valley and stays there. Momentum is not a guarantee, it is a heavier ball.

There is a price. On plain x² with η = 0.1, momentum with β = 0.9 takes 99 steps to settle, against 29 for plain descent: the ball overshoots the bottom and swings back and forth before it stops.

## Adam

Adam (Kingma and Ba, 2015) keeps two running averages per weight: m of the gradient, and s of its square. The step is η·m̂ / (√ŝ + ε). Dividing by √ŝ, the typical size of that coordinate's gradient, makes the step about η in every coordinate, steep or flat.

In [Adam: the same step in every direction](#example:adam-narrow), the first steps move 0.1 in x and 0.1 in y, even though the gradient in y is about three times larger than in x. No zigzag. Near the bottom the steps shrink, because m forgets faster than s does.

Both averages start at 0, so early on they are too small. The bias correction divides them by 1 − β₁ᵗ and 1 − β₂ᵗ, which undoes that start exactly. After the first step m̂ = g and ŝ = g², and the step is η·g/|g|. [Without it](#example:no-bias-correction), the first step is (1 − β₁)/√(1 − β₂) ≈ 3.2 times too big: 0.32 instead of 0.1, with β₁ = 0.9 and β₂ = 0.999.

Adam also takes [a curved valley](#example:curved-valley) in stride: 92 steps from (−1.5, 2) to (1, 1). Plain gradient descent with η = 0.05 diverges there in 5 steps, and with η = 0.01 it is still short of the bottom after 200.

## When to use which

Plain gradient descent is the right first try for a small, well-scaled problem, and it is the one you can analyze. Momentum helps when the loss has long, narrow valleys, which is common. Adam is the usual default for training neural networks, transformers especially, partly because it needs less tuning of the learning rate.

None of them finds the global minimum of a bumpy loss. Each one goes downhill from where it starts. In large networks this seems to matter less than you would fear: the low valleys that training finds tend to be about as good as each other.

## Common mistakes

- Picking η by habit. The right value depends on the curvature. Try a few, ten times apart, and watch the loss.
- Reading a loss that goes up and down as noise. If f bounces between the same values, η is too large. [Show me](#play:bounce)
- Reading a slowly falling loss as "almost done". [The crawl](#example:crawl) is still going down after 200 steps.
- Expecting momentum to always be faster. On an easy bowl it overshoots and takes longer.
- Leaving out Adam's bias correction. The first steps come out too big.
- Forgetting that Adam's memory is two extra copies of the model, one for m and one for s.

## At real scale

Large language models are trained with Adam or its variant AdamW, which applies weight decay separately from the gradient step (Loshchilov and Hutter, 2019). GPT-3 (2020) used β₁ = 0.9, β₂ = 0.95 and ε = 10⁻⁸; LLaMA (2023) used AdamW with the same β values. Kingma and Ba's suggested β₂ is 0.999; large models often use 0.95, so the average of g² forgets faster. They also change η over the run, warming it up from near 0 and then decaying it, where this page keeps it fixed.

The memory adds up. For a model with 7 billion weights, Adam keeps 14 billion more numbers, before counting the gradients themselves.

## Try this

- [Just right: it converges](#example:converge): set η to 0.5. How many steps now, and why?
- On x², which η makes the run bounce? Predict it from the factor 1 − 2η, then check with [the bounce](#example:bounce).
- In [the zigzag](#example:zigzag), switch to momentum with β = 0.5. Then try β = 0.9. Which is faster?
- In [Stuck in the nearer valley](#example:local-minimum), start at x = −2 instead. Which valley does it find?
- In [Adam: the same step in every direction](#example:adam-narrow), set β₂ to 0.9. What changes near the bottom?
- [A round bowl in one step](#example:round-one-step) uses η = 1. Why does that work on (x² + y²)/2 and diverge on (x² + 10y²)/2?

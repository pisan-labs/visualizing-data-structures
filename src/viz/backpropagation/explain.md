# Backpropagation

Training a network means nudging every weight so the loss goes down. To nudge a weight you need to know which way the loss moves when that weight moves, and by how much: the gradient. A model with a hundred million weights needs a hundred million of those numbers, every step. Backpropagation gets all of them in one pass backwards through the computation, for a small constant times the cost of the forward pass.

The trick is old. Reverse-mode differentiation goes back to Linnainmaa (1970), and Rumelhart, Hinton and Williams (1986) made it the way neural networks learn. Every framework since does the same three things this page does: build a graph, sort it, walk it backwards.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| forward | compute every node's value, inputs first | Θ(V + E) |
| topological sort | depth-first search from f: each node goes on the list after the nodes it reads | Θ(V + E) |
| backward | walk the list from the end; each edge sends ∂v/∂u · ∂f/∂v back to u | Θ(V + E) |
| zero | every gradient back to 0 | Θ(V) |

V is the number of nodes (a node per variable and per operation) and E the number of edges. Each node holds two numbers: its value, and its gradient ∂f/∂(node), how much f moves when that node moves a little. [Show me](#play:used-twice)

## The chain rule, one edge at a time

Every node knows one small thing: how its output moves with each of its inputs. For n1 = a × b, ∂n1/∂a is just b. That is the local derivative. It needs the values from the forward pass, which is why the forward pass keeps them.

The chain rule glues the small things together. If f moves 2 for every 1 that n1 moves, and n1 moves −3 for every 1 that a moves, then f moves 2 × (−3) = −6 through n1 for every 1 that a moves. So the backward pass starts with ∂f/∂f = 1 and sends gradients back along the edges. Each edge carries the local derivative times the gradient of the node at its head.

```check
Q: f = a × b with a = 3 and b = −2. What is ∂f/∂a?
- 3
* −2
- −6
- 1
= The local derivative of a product with respect to one factor is the other factor: b = −2. If a goes up by 0.01, f goes down by 0.02.
```

## A value used twice

In [A value used twice](#example:used-twice), f = (a·b + c)·a with a = 2, b = −3, c = 4. The variable a is one node with two edges out: n1 reads it and so does f. Change a and f moves through both paths, so a gets a share from each. From f directly: n2 = −2. Through n1: b × ∂f/∂n1 = −3 × 2 = −6. The gradient is the sum, −2 + (−6) = −8.

Check it by hand: f = a²b + ac, so ∂f/∂a = 2ab + c = −12 + 4 = −8. Good.

That sum is why the update is `u.grad += ...` and not `u.grad = ...`. With `=`, the second share wipes out the first. [The bug: overwriting instead of adding](#example:overwrite-bug) gives ∂f/∂a = −6. Notice that b and c still come out right, because each is used once. The bug only bites values with more than one use, which is how it survives testing on simple examples.

```check
Q: f = a × a with a = 3. The graph has one node for a and two edges into f. What is ∂f/∂a?
- 3
* 6
- 9
- 1
= Each edge sends the other factor times ∂f/∂f = 1: 3 along the first edge and 3 along the second. They add up to 6, which matches the derivative of a², 2a.
```

## Why the order matters

A node may pass its gradient back only once it is complete, after every node that reads it has sent its share. Walk the nodes in reverse topological order and that is guaranteed: everything that reads a node comes after it on the list, so it is visited before it in the backward pass.

The page builds the list the way [topological sort with DFS](/topo-dfs/) does: depth-first search from f, and a node goes on the list once everything it reads is on it. For the used-twice example that is a, b, n1, c, n2, f, and the backward pass visits f, n2, c, n1, b, a. Step through at "Every detail" to watch the list fill.

This is the same move as [shortest paths in a DAG](/dag-shortest-paths/): process the nodes in topological order and each node's answer is ready when someone needs it. The gradient is a sum over every path from a to f of the product of the local derivatives along the path. There can be exponentially many paths; the backward pass never lists them. Each node adds up its shares once and passes the total on.

## One neuron

[One neuron](#example:neuron) is tanh(w1·x1 + w2·x2 + b) with w1 = 0.5, x1 = 1, w2 = 0.25, x2 = −2 and b = 0.5. The weighted sum is 0.5 and the output is tanh(0.5) = 0.46. The local derivative of tanh is 1 − tanh², here 0.79, and everything before it gets multiplied by that. So ∂f/∂b = 0.79, ∂f/∂w1 = 0.79 × x1 = 0.79 and ∂f/∂w2 = 0.79 × x2 = −1.57.

Notice the pattern: the gradient of a weight is the gradient arriving at its product, times the input it multiplies. A weight on a large input gets a large gradient. An input of 0 gives its weight nothing to learn from.

## When the gradient vanishes

The chain rule multiplies. One small factor and everything before it is small.

- [A saturated tanh](#example:saturated): tanh(7) = 0.999998. The curve is flat out there, and its local derivative is 0.0000033. The gradients for a and b are about 0.00001. Gradient descent with these would take forever.
- [A dead ReLU](#example:dead-relu): relu(−5) = 0, and its slope there is exactly 0. Every gradient before it is 0. Nothing upstream learns anything until something else moves the input above 0.

Deep networks stack dozens of these factors, which is why initialization, normalization and residual connections matter so much. They keep the products from collapsing to 0 (or blowing up).

## Zeroing the gradients

PyTorch adds new gradients onto whatever is already in `.grad`. That is a feature: it lets you add up gradients over several small batches before taking a step. It also means a training loop has to zero the gradients before every backward pass. In PyTorch that is `optimizer.zero_grad()`.

[Forgetting to zero the gradients](#example:forgot-zero) runs backward twice without it. Every variable ends at twice its true gradient: ∂f/∂a = −16 instead of −8. Run it a third time and you get three times. Nothing crashes. The model just trains with the wrong step size, which can take a while to notice.

## Common mistakes

- `=` instead of `+=` when sending a share back. It works until a value is used twice. [Show me](#play:overwrite-bug)
- Forgetting to zero the gradients between steps. Every gradient grows by one copy per step.
- Visiting nodes in the order they were built instead of the reverse. A node then passes on a gradient that is still missing shares.
- Throwing away the forward values. The local derivatives need them: ∂(a·b)/∂a is b.
- Trusting the gradient code without a check. Nudge one input by 0.001, see how much f moves, and compare with the gradient. It catches most bugs on this page in one line.
- Reading a gradient of 0 as "this input does not matter". Sometimes it means a ReLU is dead or a tanh is saturated.

## At real scale

PyTorch does what this page does, with whole matrices as the nodes instead of single numbers. As your code runs, it records each operation in a graph. `loss.backward()` walks that graph from the loss, visiting a node only after everything that reads it has sent its share, and adds each share into the weights' `.grad`. A matrix product, a softmax or a layer norm is one node, with its local derivative written once, by hand.

The forward values of every node have to be kept until the backward pass uses them. For a large model that memory, more than the arithmetic, often limits the batch size. Gradient checkpointing throws some of them away and recomputes them during the backward pass: more time, less memory.

## Try this

- In [A value used twice](#example:used-twice), load `(a*b + c) * a; a=3, b=1, c=-2`. Work out ∂f/∂a = 2ab + c before you press Backward.
- Switch to overwriting and press Backward. Which gradients are wrong, and why only those?
- Turn off zeroing and press Backward three times. What does ∂f/∂b read after each press?
- In [One neuron](#example:neuron), change b to 3. What happens to every gradient, and why?
- In [A dead ReLU](#example:dead-relu), change c to 7. Do the gradients come back?
- Load `(a + b)^2` and then `a*a + 2*a*b + b*b` with the same values. Different graphs, same function. Are the gradients the same?
- [Functions inside functions](#example:chain) runs the forward pass first, then the backward pass. Which nodes need their own value to work out their local derivative?

# Memory model: values, references, aliasing

What does `ys = xs` do? It looks like it makes a copy. In Python and Java it doesn't: it gives the same list a second name. In C++ it does copy, every element. Most "my list changed by itself" bugs come from not knowing which one you have.

The drawing has two parts. The **stack** on the left holds one frame per function call, and each frame holds that call's variables. The **heap** on the right holds objects, here lists, that live independently of any one call. An arrow from a variable to a list is a reference: the variable holds where the list is, not the list.

## The statements

| Statement | Python and Java | C++ | Cost |
|---|---|---|---|
| `x = 5` | 5 goes in x's box | the same | O(1) |
| `xs = [1, 2]` | new list on the heap, xs refers to it | the values go in xs | O(n) to build |
| `ys = xs` | copy the reference: one list, two names | copy every value | O(1) or O(n) |
| `&r = x` | (not possible) | r is another name for x | O(1) |
| `xs.append(v)` | change the list xs refers to | change xs | O(1) amortized |
| `xs[i] = v` | change one item of that list | change one item of xs | O(1) |
| `f(xs)` | f's parameter gets a copy of the reference | f gets a copy, unless it takes `&` | O(1) or O(n) |

Type them in the box and press **Run**. The functions `grow`, `reset` and `bump` are already defined; the code panel shows what they do.

## Two names, one list

`ys = xs` copies whatever xs holds. For a number, that is the number. For a list in Python or Java, it is a reference, so now two arrows point at one list. Change the list through either name and both see it. That is aliasing. [Show me](#play:aliasing)

Numbers behave the way you expect, because changing a number always means putting a new number in the box. [Numbers are copied](#example:numbers-copy)

```check
Q: In Python, after `xs = [1, 2]`, `ys = xs`, `ys.append(3)`, what is xs?
- [1, 2]
* [1, 2, 3]
- [3]
= ys = xs made a second name for the same list, so the append shows through both names.
```

## Mutating versus reassigning

There are two very different things you can do to a variable that refers to a list. `ys.append(3)` follows the arrow and changes the list. `ys = [9]` changes the arrow: ys now refers to a new list, and xs is left exactly where it was. The first is visible through every alias. The second is not visible to anyone else. [Reassigning is not changing](#example:reassign-vs-mutate)

When the last arrow to a list goes away, nothing can reach that list again. It is garbage, and the garbage collector frees it. Python mostly does this the moment the last reference disappears; Java waits and collects in batches. Here it happens before the next statement. [Garbage](#example:garbage)

## Calling a function

Python and Java pass every argument the same way: the parameter gets a copy of what the argument holds. For a list, that is a copy of the reference. People call it "pass by reference value", or "pass by object reference", or argue about whether it is pass by value (it is, the value just happens to be a reference).

What follows from that is simple. A function can change your list, because it has an arrow to the same list. A function cannot make your variable refer to a different list, because it only has a copy of your arrow. `grow(xs)` appends to your list. `reset(xs)` points its own `a` at a new list and your xs never notices. [Passing a list to a function](#example:pass-reference-value)

And no function can change your number. `bump(n)` adds one to its own copy. If you want the new value, return it and save it: `n = bump(n)`. [A function cannot change your number](#example:bump-number)

```check
Q: In Java, `void reset(List<Integer> a) { a = new ArrayList<>(); }`. After `reset(xs)`, what is xs?
* The same list as before, unchanged
- An empty list
- null
= reset only changed its own copy of the reference. The caller's xs still points at the old list.
```

## C++: values, and references when you ask

Switch the **Language model** to C++. Now a variable holds its value, even a whole list (a `std::vector`), and `ys = xs` copies all of it. Change ys and xs stays put. The **copied** counter shows what that costs: n values for every copy. [C++ copies the whole list](#example:cpp-copy)

C++ makes you ask for sharing with `&`. `auto& r = x` (here `&r = x`) makes r another name for x: not a copy, not a pointer you can move, just a second name. Anything done to r happens to x, including `r = 7`. [C++ references](#example:cpp-reference)

Functions choose in their signature. `void grow(std::vector<int> a)` takes a copy, so nothing outside changes. `void growRef(std::vector<int>& a)` takes a reference, so it changes the caller's vector, and `resetRef` can even replace its contents, which no Python function can do to your variable. [Pass by value, pass by reference](#example:cpp-pass)

(Inside, a vector keeps its elements in a block on the heap that the vector owns. The drawing leaves that out: what matters is that the vector copies that block when you copy the vector.)

## Common mistakes

- Thinking `ys = xs` makes a copy in Python or Java. Use `ys = list(xs)`, `xs.copy()` or `new ArrayList<>(xs)`.
- `grid = [[0] * 3] * 3` in Python. That is three references to one row, so setting `grid[0][0]` sets the first item of every row.
- A default argument that is a list, `def f(a=[])`. The same list is reused on every call.
- Expecting a function to swap two numbers, or to replace the caller's list. In Python and Java it can't; return the new value instead.
- Passing a big vector by value in C++ without meaning to. Use `const std::vector<int>&` for input you don't change.
- Returning a reference to a local variable in C++. The frame is gone after the return.

## Try this

- [Two names, one list](#example:aliasing). Then type `xs = [5]` and run `ys.append(6)`. Which list grows?
- Run `xs = [1, 2]`, `ys = xs`, `zs = ys`, then `zs[0] = 9`. How many arrows point at the list?
- Switch to C++ and type `x = 5`, `&r = x`, `&s = r`, `s = 1`. What is x?
- In C++, type `x = 5` and then `x = [1, 2]`. Python allows it. Why does C++ refuse?

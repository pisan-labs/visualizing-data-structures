# Reversing a string

Reversing a string is a loop with two indices in most languages, and one built-in call in the rest. So why do it with recursion? Because it is the smallest problem where you can watch partial results build up on the way back, and it comes in two versions that teach different things.

## Two ways to split the problem

Every recursive function needs a way to make the problem smaller. Here are two.

**Reverse the rest, then add the first character.** The reverse of `"STACK"` is the reverse of `"TACK"`, followed by `"S"`. That is a smaller string, so recursion handles it.

```
reverse(s)
  if length(s) <= 1
    return s
  return reverse(s[1..]) + s[0]
```

**Swap the two ends, then reverse the inside.** Put the characters in an array, swap `A[0]` with `A[4]`, and reverse whatever is between them.

```
reverse(A, i, j)
  if i >= j
    return
  swap A[i] and A[j]
  reverse(A, i + 1, j - 1)
```

| | Calls | Stack depth | Time |
|---|---|---|---|
| Rest first | n | n | O(n²): every call copies its part of the string |
| Swap the ends | about n / 2 | about n / 2 | O(n): one swap per pair |

The **How each call works** option switches between them.

## Partial results on the way back

In the first version nothing is reversed on the way down. Each frame waits with a character it cannot place yet. The work happens on the way back: the base case returns `"K"`, then each frame adds its own first character to what it got back. `"K"`, `"KC"`, `"KCA"`, `"KCAT"`, `"KCATS"`. Each frame shows the value it receives and the value it hands down, and the call tree on the left keeps every partial result after its frame is gone. [Show me](#play:rest-first)

```check
Q: `reverse("CODE")` runs, reversing the rest first. What does the call `reverse("DE")` return to its caller?
- `"CODE"`
- `"EDOC"`
* `"ED"`
- `"E"`
= Each call returns the reverse of its own part of the string. Its caller then adds `"O"` to get `"EDO"`.
```

## In place, from the outside in

The second version does all its work on the way down. Each call swaps two characters into their final places, so the finished part grows from both ends toward the middle. On the way back the frames have nothing left to do: the recursive call is the last thing each one does, a tail call. Python and Java keep every one of those frames anyway. [Show me](#play:swap-ends)

The base case needs care. With an odd length, i and j meet on the middle character, which stays put. With an even length they never meet: after the last swap, i is one past j. That is why the test is `i >= j`. [An even length](#example:even-length)

## When to use it, when to avoid it

Use the first version to practice thinking recursively: assume `reverse(s[1..])` works, and check what to do with its answer. Avoid it for long strings. Each call copies its part of the string twice (the slice and the concatenation), which adds up to about n² characters, and the stack needs a frame per character. A string of 1000 characters is already too long for Python's default limit of 1000 frames.

The swap version is closer to what you would write for real, but a loop with two indices does the same swaps with no stack at all. In Python, `s[::-1]` does the whole thing.

## Common mistakes

- Testing `i == j` in the swap version. With an even length i jumps past j, and the calls never stop.
- Writing `s[0] + reverse(s[1..])`. That puts the first character back in front, so you get the original string.
- Forgetting that strings are immutable in Python and Java. The first version builds a new string in every call; the swap version needs an array (a list, a `char[]`).
- Expecting the tail call to save stack space in Python or Java. It doesn't.

## Try this

- [Reverse the rest, then add the first character](#example:rest-first). Before each return, predict the partial result.
- [Swap the two ends](#example:swap-ends). Count the calls, and compare with the first version.
- [The base case](#example:one-character): one character, one call.
- [An even length](#example:even-length) and [a palindrome](#example:palindrome). Watch i and j at the end.
- [Eight characters](#example:longest), the deepest stack on this page. Then switch to swapping and run it again.

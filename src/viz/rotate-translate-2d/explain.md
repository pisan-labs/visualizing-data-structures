# 2D rotation and translation

Pick up a book from your desk and put it somewhere else. You can turn it and you can slide it, but it is still the same book: same size, same corners, same angles. That is a *rigid motion*. In 2D every rigid motion (leaving out mirror images) is one rotation followed by one translation:

```
p' = R p + t
```

R turns, t slides. Games do this to every object on every frame, so it is worth getting the bookkeeping right.

## A slide is not a matrix (until it is)

A 2×2 matrix always sends the origin to the origin. A translation moves the origin. So no 2×2 matrix can translate, and you end up carrying R and t around as two separate things. [A matrix plus an offset](#example:matrix-plus-offset)

The trick is to write the point as (x, y, 1). Now a 3×3 matrix can do both:

```
[x']   [cos θ  −sin θ  tx] [x]
[y'] = [sin θ   cos θ  ty] [y]
[1 ]   [  0       0     1] [1]
```

The 1 at the bottom of the point picks up tx and ty from the last column. These are *homogeneous coordinates*. A translation is now a matrix, a rotation is a matrix, and a chain of them multiplies into one matrix. [Only a slide](#example:slide-only)

The **Matrix form** option switches the page between the two ways of writing it. Same numbers, different bookkeeping.

## Order matters

Rotate the F by 90° and then slide it 4 to the right. Now slide it first and then rotate. Different places. In the second order the rotation turns everything about the origin, including the slide you already did, so the F moves by R t instead of t. [Show me](#play:order-matters)

With column vectors the first motion sits on the right, so rotate-then-translate is T·R and translate-then-rotate is R·T. Matrix multiplication does not commute, and this is the friendliest example of it I know.

There are two boring exceptions: no slide at all, or a whole number of turns. [When order does not matter](#example:zero-slide) [A full turn](#example:full-turn)

```check
Q: You rotate by 90° and then translate by (4, 0). Where does the origin end up?
* (4, 0)
- (0, 4)
- It stays at (0, 0)
= The rotation leaves the origin where it is, then the slide moves it to (4, 0). In the other order it would end at R (4, 0) = (0, 4).
```

## Rotating about a point

Rotation matrices turn about the origin. To turn the F about its own corner c, slide c to the origin, rotate, and slide back:

```
A = T(c) · R · T(−c)
```

Read it right to left (column vectors). The point c goes to the origin, does not move during the rotation, and comes back. So c stays put and everything else swings around it. The page shows all three moves and then the single matrix they multiply into. Its last column is *not* c, which surprises people: it is where A sends the origin. [Turning about a point](#example:about-a-point)

## Undoing a rigid motion

To undo p' = R p + t, solve for p:

```
p = Rᵀ (p' − t) = Rᵀ p' − Rᵀ t
```

A rotation's inverse is its transpose (turning back by θ swaps the signs of the sines), so the inverse costs a transpose and one matrix-vector product, no division, and it always exists. In 3×3 form:

```
M⁻¹ = [Rᵀ   −Rᵀ t]
      [0  0   1  ]
```

The common mistake is to write −t for the offset. That undoes the slide but forgets that the slide was turned. [Undo it all](#example:undo-it-all)

```check
Q: M rotates by 90° and then translates by (3, 0). What is the offset of M⁻¹?
- (−3, 0)
* (0, 3)
- (3, 0)
= −Rᵀ t, and Rᵀ is a rotation by −90°, which sends (3, 0) to (0, −3). Negate it: (0, 3).
```

## Rows or columns

Most math books and OpenGL write points as columns and put the matrix on the left. DirectX writes them as rows: p' = p M. With rows every matrix is transposed, so the slide sits in the bottom row instead of the last column, and composition reads left to right. Neither is wrong. Check which one a library uses before you copy a matrix out of it. [Row vectors](#example:row-vectors)

## What it costs

Applying a 3×3 matrix to a point is 4 multiplications and 4 additions (the bottom row is always 0 0 1, so nobody actually computes it). Multiplying two 3×3 matrices is a fixed 27 multiplications. So for k motions on n vertices, multiply the k matrices first, O(k), and apply the result once to every vertex, O(n). Applying each motion to every vertex in turn is O(kn). This page keeps one running matrix M, the way a game engine does. The inverse of a rigid motion is O(1) and never fails, which is more than you can say for a general matrix.

## Common mistakes

- Composing in the wrong order. Say it out loud: "first rotate, then translate", and write the first one nearest the point.
- Rotating about the origin when you meant the object's centre. The object swings around the origin like a door.
- Writing the inverse offset as −t instead of −Rᵀ t.
- Passing degrees to `cos` and `sin`. They take radians: multiply by π/180.
- Forgetting the 1. A point is (x, y, 1). A direction, which should not be slid, is (x, y, 0).
- Moving the shape off the screen and wondering where it went. The page refuses moves that would leave the drawing. [Off the drawing](#example:off-the-drawing)

## Try this

- Type `90 4 0` and press **Compare orders**. Then `90 0 0`, and `360 4 0`. Which ones agree, and why?
- Rotate by 90, translate by `3 -2`, and press **Undo all (inverse)**. Predict the offset of M⁻¹ before you step.
- Type `180 2 3` and press **Rotate about a point**. Which point does not move? Is it on the F?
- Switch **Matrix form** to the 2×2 form and compose a few motions. Watch how t gets turned by each later rotation.

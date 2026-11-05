# 2D rotation and scale

Rotating and scaling a shape sounds like it should need trigonometry for every vertex. It does not. Both are *linear* maps, and a linear map in 2D is completely described by four numbers in a 2×2 matrix. Multiply every vertex by the matrix and you are done.

## Watch the basis vectors

Every point is a mix of the two basis vectors: (x, y) = x·e₁ + y·e₂, with e₁ = (1, 0) and e₂ = (0, 1). A linear map keeps the mix and moves the ingredients. So if you know where e₁ and e₂ go, you know where everything goes:

```
M (x, y) = x·(M e₁) + y·(M e₂)
```

And M e₁, M e₂ are just the columns of M. That is the most useful fact about matrices I know: **the columns are where the basis vectors land.** The page draws them, along with the image of the unit square (dashed).

## Rotation

Rotating e₁ by θ gives (cos θ, sin θ). Rotating e₂ gives (−sin θ, cos θ). Those are the columns:

```
R = [cos θ  −sin θ]
    [sin θ   cos θ]
```

A quarter turn has cos = 0 and sin = 1, so (x, y) goes to (−y, x). [Show me](#play:quarter-turn)

Rotation keeps lengths and angles, and det R = cos² θ + sin² θ = 1, so areas do not change.

```check
Q: Where does (3, 1) go under a rotation of 90° about the origin?
- (1, 3)
* (−1, 3)
- (3, −1)
= A quarter turn sends (x, y) to (−y, x), so (3, 1) goes to (−1, 3).
```

## Scale

Scaling stretches x by sx and y by sy:

```
S = [sx  0 ]
    [0   sy]
```

Uniform scaling (sx = sy) keeps the shape and changes its size. Non-uniform scaling stretches it. The determinant, sx·sy, is the factor by which areas change: scaling by 2 and 0.5 changes the shape but not its area. [Stretch one way, squash the other](#example:stretch)

A negative factor flips the shape over. Its determinant is negative, which is how you can tell a transform includes a mirror. [A mirror image](#example:mirror)

## Order matters

Rotate then scale is not scale then rotate. With column vectors the first transform sits on the right, so rotate-then-scale is S·R and scale-then-rotate is R·S, and those are different matrices. Picture it: if you turn the F first, the stretch pulls along the world's x axis, across the turned letter. If you stretch first, the F gets wide along its own x, and then turns. [Order matters](#example:order-matters)

The exception is a uniform scale. It looks the same in every direction, so it does not care whether the shape has turned. [When order does not matter](#example:uniform-commutes)

```check
Q: Which pair always gives the same result in either order?
- A rotation and a scale by (2, 1)
* A rotation and a scale by (3, 3)
- A rotation and a scale by (−1, 1)
= A uniform scale is a multiple of the identity, so it commutes with every matrix.
```

## About a point

The matrices above turn and stretch about the origin. To rotate a shape about its own centre c, slide c to the origin, apply the matrix, and slide back:

```
p' = c + R (p − c)
```

That is three steps for the price of one, and the page shows all three when you pick **A pivot point c**. The slide is not linear (it moves the origin), which is one more reason graphics code uses 3×3 homogeneous matrices: then a slide is a matrix too, and the whole thing multiplies into one. [Turning about a point](#example:about-a-point)

## Rows or columns

Most math books and OpenGL write points as columns and put the matrix on the left: p' = M p. DirectX and some older books write points as rows: p' = p M. Neither is wrong. With rows, every matrix is the transpose of the column one, and composition reads left to right: rotate-then-scale is R·S. Pick one convention and check which one a library uses before you copy a matrix out of it. The **Vectors are** option switches the page between the two. [Row vectors](#example:row-vectors)

## What it costs

Each rotation or scale is O(1) per vertex: 4 multiplications for a rotation, 2 for a scale, so O(n) for a shape with n vertices. Composing two 2×2 matrices is a fixed 8 multiplications. So for k transforms on n vertices, compose first (O(k)) and apply the result once (O(n)), rather than applying each transform to every vertex (O(kn)). This page applies each one to the shape so you can watch it, which is the O(kn) way.

## Common mistakes

- Passing degrees to `cos` and `sin`, which take radians. Multiply by π/180 first.
- Composing in the wrong order. Write down which transform happens first and where it goes in the product.
- Rotating about the origin when you meant the shape's centre. The shape swings around the origin like a door.
- Updating x before computing y in place: `x = c·x − s·y; y = s·x + c·y` uses the *new* x in the second line. Keep the old values.
- Scaling by 0. The shape collapses onto a line (or a point) and no inverse can bring it back.

## Try this

- [A quarter turn](#example:quarter-turn). Predict where A lands before stepping.
- [Twice as big](#example:uniform-scale). Why does the F also move away from the origin?
- Type `90 2 1` and press **Compare orders**. Then try `90 2 2`, and `180 2 1`. Which pairs agree?
- Switch **Rotate and scale about** to a pivot point, set the pivot to the corner of the F (`1 1`), and rotate by 90. Which vertex stays put?

# 3D rotation and scale

Going from 2D to 3D adds one coordinate and one row and column to every matrix. The ideas carry over almost unchanged: a 3×3 matrix is a linear map, its columns are where the basis vectors go, and composing transforms is multiplying matrices. One thing does not carry over, and it is the interesting part: rotations stop commuting.

## The columns are where the basis vectors go

Every point is a mix of three basis vectors: (x, y, z) = x·e₁ + y·e₂ + z·e₃. A linear map keeps the mix and moves the ingredients:

```
M (x, y, z) = x·(M e₁) + y·(M e₂) + z·(M e₃)
```

M e₁, M e₂ and M e₃ are the three columns of M. The page draws them as Me₁, Me₂ and Me₃. If you only remember one thing about 3D matrices, remember this. You can write down any rotation by asking "where does x go? where does y go? where does z go?" and filling in the columns.

## Rotation about an axis

A rotation about the z axis is the 2D rotation you already know, with z left alone:

```
Rz = [cos θ  −sin θ  0]
     [sin θ   cos θ  0]
     [  0       0    1]
```

Rx and Ry have the same shape: a 1 on the diagonal for the axis that stays put, and cos and sin in the other four places. Positive angles turn counter-clockwise when the axis points at you: about x, y turns toward z; about y, z turns toward x; about z, x turns toward y. [A quarter turn about z](#example:quarter-turn)

Ry is the one people get wrong. Its minus sign sits on the bottom-left sine, not the top-right, because z turning toward x is the cyclic order x → y → z → x read from y.

```check
Q: Where does (2, 0, 2) go under a 90° rotation about the z axis?
- (2, 0, 2)
* (0, 2, 2)
- (0, −2, 2)
= About z, (x, y, z) goes to (−y, x, z). The z coordinate does not change.
```

A rotation keeps lengths and angles, and its determinant is 1, so volumes do not change.

## Scale

Scaling stretches each axis by its own factor:

```
S = [sx  0   0 ]
    [0   sy  0 ]
    [0   0   sz]
```

The determinant sx·sy·sz is the factor by which volumes change. [Stretch one way](#example:stretch) A negative factor mirrors the shape, and a mirror can never be built out of rotations, which is why det tells you: rotations have det 1, mirrors make it negative. [A mirror image](#example:mirror) A zero factor squashes the shape flat and there is no going back. [Squashed flat](#example:flatten)

## Order matters, even for two rotations

In 2D, rotating by 30° and then 40° is the same as 40° then 30°. In 3D, rotating about x and then about y is *not* the same as y then x. [Show me](#play:order-matters)

Try it with a book on your desk. Tip it towards you (about x), then spin it flat (about z). Now start again, and spin first, then tip. The book ends up in a different place. Matrix multiplication in 3D does not commute even for pure rotations, and this is the reason 3D graphics code is so particular about the order of rotations (yaw, pitch, roll, and arguments about which comes first).

Half turns are the exception: two half turns about perpendicular axes commute, and either way you get a half turn about the third axis. [Half turns commute](#example:half-turns)

```check
Q: Which pair of rotations gives the same result in either order?
- 90° about x and 90° about y
- 90° about x and 90° about z
* 180° about x and 180° about y
= Half turns about perpendicular axes are diagonal matrices (entries ±1), and diagonal matrices commute.
```

## Drawing 3D on a flat screen

The page does not use any 3D graphics. It projects every point to the plane with a fixed parallel projection and draws lines:

- **Isometric**: looking from the corner (1, 1, 1). The x axis points down-left, y down-right, z up, all three shortened by the same amount.
- **Oblique**: x to the right, z up, and y going into the page at 45°, at half length (a *cabinet* projection, which is what most textbook figures use).

Neither has perspective, so parallel edges stay parallel and far things are not smaller. The projection is applied *after* the transform: M moves the cube in 3D, and the projection only decides how it looks. Switch **Drawn with** and the numbers do not change. [An oblique view](#example:oblique-view)

## Rows or columns

Math books and OpenGL write points as columns, p' = M p. DirectX writes them as rows, p' = p M. With rows every matrix is transposed (so the basis vectors are the rows), and composition reads left to right. [Row vectors](#example:row-vectors)

## What it costs

Applying a 3×3 matrix to a point is 9 multiplications and 6 additions, so O(n) for n vertices. Composing two 3×3 matrices is a fixed 27 multiplications. For k transforms on n vertices, compose first (O(k)) and apply once (O(n)), rather than O(kn). This page keeps one running matrix M and applies it to the original shape, which is how a game engine does it too. A real engine also uses 4×4 matrices so translations fit in, but that is the same trick as the 2D 3×3 one.

## Common mistakes

- Getting the sign of Ry backwards.
- Composing in the wrong order. Write down which rotation happens first and where it goes in the product.
- Passing degrees to `cos` and `sin`. They take radians.
- Applying rotations one at a time to points that have already been rounded. Errors pile up and the cube slowly stops being a cube. Keep the matrix and the original points, and rebuild.
- Thinking a weird-looking picture means a wrong matrix. Sometimes it is the projection. Switch views and check the numbers.

## Try this

- [A tumbling wedge](#example:tumbling-wedge). Before each step, predict which edge ends up on the floor.
- Type `90` and press **Compare orders (x, y)**. Then `180`. Then `45`.
- Rotate about x by 90 and look at M. Which column is still (1, 0, 0)? Why?
- Scale by `1 1 -1` and look at det M. Could any sequence of rotations give you that matrix? Then try `3 3 3` to see what happens if you overdo it. [Off the drawing](#example:too-big)

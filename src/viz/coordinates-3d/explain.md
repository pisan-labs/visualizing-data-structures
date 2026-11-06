# 3D change of coordinates

A point has coordinates only in a frame. In 3D you have a lot of frames: the world, the car, the wheel on the car, the camera looking at the car, the bone in the driver's arm. Every one of them is an origin and three axes, and converting between them is the bread and butter of graphics and robotics. It is the 2D change of coordinates with one more axis, plus one shortcut you will use all the time.

## A frame is an origin and three axes

Frame B has an origin o and three axis vectors u, v, w, all written in world coordinates. The point with coordinates (a, b, c) in B is the world point you reach by starting at o and walking a along u, b along v and c along w:

```
p = o + a·u + b·v + c·w = o + M (a, b, c)
```

M has u, v, w as its columns. The page draws B's axes from o, and the dashed box is B's unit cube: everything with a, b, c between 0 and 1.

## From B to the world

Multiply and add: nine multiplications and nine additions. [A tilted frame](#example:tilted-frame)

## From the world to B

Undo it. Subtract the origin, d = p − o, then undo M:

```
(a, b, c) = M⁻¹ (p − o)
```

For a 3×3 matrix there is a neat way to write the inverse with cross products. Its rows are

```
M⁻¹ = (1 / det M) [v × w; w × u; u × v],   det M = u · (v × w)
```

Why does that work? v × w is perpendicular to both v and w, so dotting it with d ignores the v and w parts of d and only sees the u part. Divide by u · (v × w) to get the right scale, and that is a. [A skewed frame](#example:skewed-frame)

## The shortcut: M⁻¹ = Mᵀ

When u, v, w are perpendicular and all have length 1 (an *orthonormal* frame, which is what you get by turning the world's axes), the cross products are the axes themselves: v × w = u, w × u = v, u × v = w, and det M = 1. The inverse is just the transpose:

```
a = u · d,   b = v · d,   c = w · d
```

Three dot products, no division. Most frames in a game engine are orthonormal (a rotation and a translation), so this is the one you will write most often. [Show me](#play:turned-frame)

It only works for orthonormal frames. Use it on a skewed or stretched frame and you get wrong numbers with no error message, which is the worst kind of bug.

```check
Q: B has axes u = (1, 0, 0), v = (1, 1, 0) and w = (0, 0, 1). Can you find a with a = u · d?
- Yes, the frame has det M = 1
* No, u and v are not perpendicular
- Only if the origin is (0, 0, 0)
= det M = 1 is not enough. The transpose undoes M only when the axes are perpendicular unit vectors, and here u · v = 1.
```

A frame can be orthonormal and still be a mirror image: swap v and w and det M = −1. The transpose still works, but the frame is left-handed, and normals and cross products computed in it point the wrong way. [A left-handed frame](#example:left-handed)

## When there is no frame

If u, v and w lie in one plane, every combination of them stays in that plane. Most points cannot be reached, det M = u · (v × w) = 0, and there is no inverse. The page refuses such axes. A determinant that is *nearly* zero is the sneakier problem: the inverse exists, but tiny rounding errors in p turn into huge errors in (a, b, c). [Axes in one plane](#example:flat-axes)

```check
Q: u = (1, 0, 0), v = (0, 1, 0), w = (1, 1, 0). What is det M?
* 0
- 1
- 2
= v × w = (0, 0, −1), and u · (0, 0, −1) = 0. w = u + v lies in the plane of u and v.
```

## One 4×4 matrix

Write the point as (x, y, z, 1) and the origin fits into the matrix as a fourth column:

```
T = [u  v  w  o]
    [0  0  0  1]
```

Then (x, y, z, 1) = T (a, b, c, 1) does the multiply and the add at once. This is why OpenGL, Unity and friends are full of 4×4 matrices. A chain of frames (wheel in car, car in world, world in camera) multiplies into one 4×4 matrix, and each point then costs one product. The **Matrix form** option shows the page in this form. [One 4×4 matrix](#example:homogeneous)

## Moving the frame, not the point

Move B's origin onto p and p's coordinates in B become (0, 0, 0). The point did not move; the ruler did. Turning a frame one way makes every point seem to turn the other way in it, which is why a camera that turns left shows a world that swings right. [Move the frame, not the point](#example:moving-the-frame)

## What it costs

B to world is O(1): nine multiplications. World to B is O(1) too: for an orthonormal frame, three dot products; for any other frame, three cross products, a determinant and three divisions, about 33 multiplications and divisions (the page counts them). For n points, invert M once and reuse it: O(n). Recomputing the inverse for every point gives the same O(n), just with a much bigger constant.

## Common mistakes

- Forgetting to subtract the origin before undoing M.
- Using the transpose on a frame that is not orthonormal.
- Building a frame from three vectors that are almost in one plane. Check det M before you trust the answer.
- Mixing up handedness. If a cross product points the wrong way, check the sign of det M.
- Treating directions like points. A direction has no position, so it should not get the origin added: in 4×4 form it is (x, y, z, 0).

## Try this

- [Only the origin moves](#example:translate-only). With M the identity the whole conversion is a subtraction.
- Type `45 30` and press **Turn axes (degrees)**, then convert `2 2 2` with **World to B**, then press **B to world** with the answer. Are you back?
- [An oblique view](#example:oblique-view). The numbers are the same as in the isometric view; only the picture changes.
- Open **More operations** and set axes `1 0 0 0 1 0 1 1 0`. Why is it refused? Change the last 0 to 1 and try again.

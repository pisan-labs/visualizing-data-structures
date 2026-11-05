# 2D change of coordinates

A point does not have coordinates. A point has coordinates *in a frame*. The corner of your desk is at (0, 0) if you measure from the corner, and at (120, 60) if you measure from the door. Same corner.

Games and graphics are full of frames. A car's wheel is described in the car's frame, the car in the world's frame, and the world in the camera's frame. Converting between them is the most common thing a graphics program does, millions of times a second, so it pays to know exactly what the arithmetic is.

## A frame is an origin and two axes

Frame B has an origin o and two axis vectors u and v, all written in world coordinates. A point with coordinates (a, b) in B is the world point you reach by starting at o, going a steps along u and b steps along v:

```
p = o + a·u + b·v
```

Put u and v side by side as the columns of a matrix M, and this is `p = o + M (a, b)`. The dashed grid on the page is B's grid: the lines a = 1, 2, 3... and b = 1, 2, 3.... The solid grid is the world's.

## From B to the world

Easy direction: multiply and add. Four multiplications and four additions. [Show me](#play:homogeneous)

## From the world to B

Now undo it. Subtract the origin, d = p − o, then undo M:

```
(a, b) = M⁻¹ (p − o),   M⁻¹ = (1 / det M) [v.y  −v.x; −u.y  u.x]
```

where det M = u.x·v.y − v.x·u.y. For a 2×2 matrix, the inverse is "swap the diagonal, negate the other two, divide by the determinant". [A skewed frame](#example:skewed-frame)

There is a shortcut you will use all the time. When u and v are perpendicular and both have length 1 (a frame that is only turned, not stretched), M⁻¹ is simply Mᵀ, the transpose. Then a = u·d and b = v·d: two dot products, no division. That is the only case where projecting onto the axes gives the right answer. [A point in a turned frame](#example:turned-frame)

```check
Q: B has axes u = (1, 0) and v = (1, 1). Is a = u·d the right way to find a?
- Yes, it always works
* No, the axes are not perpendicular
- Only if the origin is (0, 0)
= Dot products undo M only when the axes are perpendicular unit vectors. Here det M = 1 but u·v = 1, so you need the real inverse.
```

## When there is no frame

If u and v lie on one line, det M = 0. Every combination a·u + b·v lands on that line, so most points cannot be reached at all, and M has no inverse. The page refuses such axes. In real code, a determinant that is *nearly* zero is the worse problem: the inverse exists, but small rounding errors in p become huge errors in (a, b). [Axes on one line](#example:parallel-axes)

## One 3×3 matrix

Carrying o around separately gets tedious. Write the point as (x, y, 1) and the origin can go into the matrix as a third column:

```
T = [u.x  v.x  o.x]
    [u.y  v.y  o.y]
    [ 0    0    1 ]
```

Now `(x, y, 1) = T (a, b, 1)` does the multiply and the add at once. These are homogeneous coordinates. Their real payoff is chains of frames: wheel in car, car in world, world in camera multiply into one matrix, and each point then costs one product instead of three. The **Matrix form** option switches the page between the two forms. Same numbers, different bookkeeping.

```check
Q: Converting n points through a chain of k frames. What does composing the matrices first buy you?
- Nothing, it is the same work
* O(k + n) instead of O(kn)
- O(1) per frame
= Multiply the k 3×3 matrices once (O(k)), then apply the result to each point (O(1) each).
```

## Moving the frame, not the point

Here is the part that confuses people. Move B's origin to the right and every point's B-coordinates go *down*. Turn B counter-clockwise and the points seem to turn clockwise. The point did not move; your ruler did. Transforming the frame is the inverse of transforming the points, which is why a camera that moves right shows a world that slides left. [Move the frame, not the point](#example:moving-the-frame)

## Common mistakes

- Forgetting to subtract the origin before undoing M (or adding it twice).
- Using the transpose for a frame that is stretched or skewed.
- Mixing up which frame a set of numbers is in. Naming variables `p_world` and `p_car` costs nothing and saves hours.
- Multiplying a chain of matrices in the wrong order. Matrix multiplication is not commutative.
- Treating directions like points. A direction has no position, so it should not get the origin added: in homogeneous coordinates it is (x, y, 0), not (x, y, 1).

## Try this

- [Only the origin moves](#example:translate-only). With M the identity, the whole conversion is a subtraction.
- [Stretched axes](#example:stretched-axes). Why does the long axis give the smaller number?
- Type `45` and press **Turn axes (degrees)**, then type `5 4` and press **World to B**. Then press **B to world** with the answer and check you are back where you started.
- Open **More operations** and set axes `2 0 0 1`. Which grid lines move?

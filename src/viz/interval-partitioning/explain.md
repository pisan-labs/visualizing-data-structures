# Interval partitioning

Every lecture has a start and a finish, every lecture needs a room, and two lectures in the same room cannot overlap. How few rooms will do? This is the flip side of activity selection: there you had one room and turned lectures away; here nobody is turned away, and you count rooms. It is also how you would colour an interval graph, or assign gates to flights.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| Schedule | Sort by start time; give each lecture the room free soonest, or a new room | O(n log n) |

Go through the lectures in order of start time. Keep the rooms in use in a min-heap, keyed by the time each room is free again. For each lecture, look at the top of the heap: if that room is free by the time the lecture starts, use it; otherwise no room is free, so open a new one. Either way, push the room back with the lecture's finish time. [Show me](#play:ten-lectures)

The picture puts the rooms on top and the lectures waiting below. Each lecture slides up into its room's lane, coloured by room. The heap shows each room and when it is free, written R2·13; its first box is the top.

## Why it is the fewest

Define the depth: the largest number of lectures on at the same moment. No schedule can use fewer rooms than the depth, because those lectures need a room each at that moment.

Greedy never uses more. Suppose it opens room d for some lecture L. That only happens when every one of the d − 1 rooms already open is busy at L's start. Each of them holds a lecture that started no later than L (we go in start order) and has not finished yet. With L, that is d lectures on at L's start, so the depth is at least d. Greedy rooms ≤ depth ≤ any schedule's rooms. So greedy is the best possible, and the dashed line at the end shows the moment that proves it.

```check
Q: Lectures 9-11, 10-12 and 11-13, with half-open times. How many rooms?
- 3
* 2
- 1
- 4
= At 10, 9-11 and 10-12 are on: depth 2. 11-13 can use the room 9-11 leaves at 11. Two rooms.
```

## Touching ends

Does a lecture that ends at 10 clash with one that starts at 10? With half-open times, [start, finish), it does not: the room is free at 10. That is the default. Switch to closed times under Options and the two clash, which can change the answer. [Back to back](#example:back-to-back) needs one room with half-open times and [two rooms](#example:touching-clash) with closed ones. Decide this before you write the comparison; it is the line where off-by-one bugs live.

## Why a heap?

Any free room would do; the heap just finds one quickly. Without it, each lecture would scan every open room, O(d) per lecture and O(nd) in all. The heap makes each lecture O(log d). [Take the room free soonest](#example:soonest-free) shows a moment with two free rooms: the heap hands out the one free soonest.

Note that the order of the lectures matters, not the choice of room. Go through them in a random order and greedy can open too many rooms. Sorting by finish time does not work either; start time is what the proof needs.

```check
Q: Why must the lectures be taken in order of start time?
- So the heap stays small
* So that every busy room holds a lecture that started no later, which makes the depth at least the number of rooms
- Because finish times can be equal
- It does not matter
= The proof that greedy uses no more than the depth rooms relies on every busy room holding a lecture that started before the current one.
```

## When to use it

Rooms for lectures, gates for flights, machines for jobs with fixed times, registers for variables whose lifetimes are intervals. Avoid it when the jobs can move in time (that is scheduling with release times and deadlines, a harder problem), or when rooms differ in size.

## Common mistakes

- Sorting by finish time. That is activity selection's rule, not this one.
- Comparing with the most recently used room instead of the room free soonest.
- Getting touching ends wrong: < where you meant <=.
- Counting rooms as the number of lectures that overlap some other lecture. The depth is about one moment.

## Try this

- [All at once](#example:all-at-once): what does the heap look like at the end?
- Type `8-10 9-11 10-12 11-13 12-14`, press **Load lectures**, and predict the rooms before you schedule.
- Find lectures where the half-open and closed answers differ by more than one.

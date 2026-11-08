# Amortized analysis

Some operations are cheap almost every time and expensive once in a while. Appending to a dynamic array usually costs one write, but when the array is full it copies every item first. Incrementing a binary counter usually flips a bit or two, but going from 0111 to 1000 flips four. Quote the worst case for each operation and these structures look much slower than they are.

Amortized analysis looks at a whole sequence of operations instead, and asks what each one costs when the total is shared out. This page does it for a dynamic array and a binary counter, with the three methods from CLRS (chapter 16, or 17 in older editions). Pick the structure and the method under **Options**. Every unit of work costs 1: writing an item, copying an item, flipping a bit. The upper chart shows what each operation actually cost, and the lower one shows the running average, the bank, or Φ.

## Amortized is not average case

Average-case analysis averages over inputs: quicksort on a random permutation, say. It needs an assumption about which inputs are likely, and an unlucky input can still be slow. Amortized analysis assumes nothing about the input. It is a worst-case guarantee for a sequence: any n appends to a doubling array cost less than 3n in total, whatever you append and in whatever order. No probability anywhere.

What it does not promise is that every operation is fast. The 17th append to a doubling array copies 16 items before it can write anything. That one append is O(n). [The most expensive append so far](#example:expensive-append) So the 17th append is slow. The 16 before it paid for it.

```check
Q: Append on a doubling array is O(1) amortized. What does that tell you about a single append?
- It always takes constant time
- It takes constant time on average over random inputs
* It can take O(n) time, but any n appends take O(n) time in total
- It takes O(log n) time
= Amortized cost bounds the total over every sequence of appends. One append that copies n items is still O(n).
```

## Aggregate: add it all up, then divide

The plain approach. Add up the actual costs of n operations and divide by n.

The array starts with no slots and grows to 1, 2, 4, 8, … slots, so the appends that find it full copy 1, 2, 4, 8, … items. For n appends those copies add up to less than 2n. The n writes add n more, so the total is less than 3n: under 3 per append. Set **Method** to Aggregate and watch the lower chart. The average jumps at every copy and never reaches the dashed line at 3. [Show me](#play:doubling-average)

The counter works the same way. Bit 0 flips on every increment, bit 1 on every second one, bit 2 on every fourth. Over n increments that is n + n/2 + n/4 + … flips, less than 2n. Sixteen increments flip 31 bits, even though the 16th flips 5 of them. [Fewer than 2 flips per increment](#example:counter-flips)

The aggregate method hands every operation the same amortized cost. That is fine with one kind of operation. With several kinds (push and multipop, insert and delete) the next two methods let each kind have its own.

## Accounting: charge coins, bank the spares

Charge every operation a fixed number of coins. When an operation costs less than its charge, the spare coins go into the bank. When it costs more, the bank pays the difference. If the bank never goes below zero, the charges add up to at least the actual costs, and the charge is an upper bound on the amortized cost.

The trick is deciding where the spare coins sit. For the array, charge 3 per append. One coin pays for the write and two sit on the new item's cell. When the array fills up, the items that came in since the last grow each hold two coins: one pays to copy that item, and the other pays to copy an older item that spent its coins at the last grow. Every copy is paid for and the bank never runs dry. [Show me](#play:doubling-coins)

Charge 2 instead and the 5th append is in trouble. It has to copy 4 items, and with its own spare coin and the 1 in the bank it can pay for 2 of them. The bank ends at −2, and the page marks it in red. [Two coins per append run out](#example:charge-too-small)

For the counter, charge 2 per increment. One coin pays for setting a bit to 1, and the other waits on that bit. When a later increment resets the bit to 0, the bit's own coin pays. Every 1 bit carries a coin, so the bank always holds exactly as many coins as there are 1 bits. [A coin on every 1 bit](#example:counter-coins) With a charge of 1 nothing is left to sit on the bit, and the second increment goes short. [One coin per increment is not enough](#example:counter-one-coin)

## Potential: store the work in the structure

The potential method keeps the bank inside the structure. Pick a function Φ of the structure's state, called the potential, that starts at 0. The amortized cost of an operation is its actual cost plus the change in Φ:

```
amortized = actual + Φ(after) − Φ(before)
```

Add this up over n operations and the Φ terms cancel in pairs, leaving the actual total plus Φ(end) − Φ(start). As long as Φ never drops below where it started, the amortized total is at least the actual total.

For doubling, Φ = 2·size − capacity. A cheap append adds an item and leaves the capacity alone: actual cost 1, Φ goes up by 2, amortized 3. An append into a full array of n items copies n and writes 1, so its actual cost is n + 1. Φ goes from 2n − n = n down to 2(n + 1) − 2n = 2, a change of 2 − n. Amortized: n + 1 + 2 − n = 3. The expensive append spends exactly the potential the cheap ones built up. In the upper chart the ticks sit flat at 3 while the bars spike. [Show me](#play:doubling-potential)

For the counter, Φ is the number of 1 bits. An increment that resets t bits and sets one costs t + 1 and changes Φ by 1 − t. Amortized: 2, every time. [Φ counts the 1 bits](#example:counter-potential)

If those formulas look familiar, they should. 2·size − capacity is the number of coins sitting on the array's cells in the accounting method, and the number of 1 bits is the number of coins on the counter. Φ is the bank, written as a formula.

```check
Q: The counter reads 0111 and Φ is the number of 1 bits. What is the amortized cost of the next increment?
- 4
- 1
* 2
- 0
= It flips 4 bits, so the actual cost is 4. Φ goes from 3 to 1, so the amortized cost is 4 + (1 − 3) = 2.
```

## Which method, when

Done right, all three give the same answer. They differ in how much work it takes to get there.

The aggregate method is the quickest when there is one kind of operation and the total is a sum you can work out, like a geometric series or bits that flip half as often as the bit below. The accounting method suits a story about who pays for what: each new item pays for its own copy and one more, each 1 bit pays for its own reset. It also copes with several kinds of operation, each with its own charge. The potential method is the most mechanical. Guess Φ, check that it never goes below its start, and do the algebra for each kind of operation. Splay trees and Fibonacci heaps are analyzed this way, since nobody can say where the coins should sit.

## Why doubling works and growing by a constant does not

Right after a doubling, the array is half full. The next n/2 appends are cheap, and they pay for copying all n items at the next grow: two coins each. The bigger the array, the more cheap appends there are to share the bill.

Grow by 4 slots instead and only 4 cheap appends come before the next grow, however big the array is. Those 4 have to pay for copying everything. The copies add up to 4 + 8 + 12 + …, about n²/8 for n appends, so the average climbs with n. That is O(n) per append, amortized. [Growing by 4 makes the average climb](#example:constant-growth)

No constant charge survives it. With 3 coins the bank goes short at append 17, with 4 at append 25. Each extra coin buys 8 more appends, and the bill keeps growing. [No charge survives growing by 4](#example:constant-growth-bank)

Growing by 1.5 works, it just needs a bigger charge. After a grow only a third of the slots are free, so each new item pays for its own copy and two older ones: a charge of 4, or Φ = 3·size − 2·capacity. With 3 coins the bank goes short at append 9. [Growing by 1.5 needs 4 coins](#example:growth-needs-four) Any factor above 1 works the same way; [the dynamic array page](/dynamic-array/) has the trade between memory and copying.

## Common mistakes

- Charging too little. A charge of 2 per append survives four appends, goes short on the fifth, and is back above zero by the eighth. Check the bank after every operation, not only at the end.
- Letting the potential go negative. The amortized costs only bound the actual total while Φ stays at or above its start. Grow by 4 with Φ = 2·size − capacity and the first append allocates 4 slots for 1 item: Φ drops to −2 and that append's amortized cost is −1, less than free. The growing appends then come out at 3, 7, 11, …, the potential method's way of saying this rule is not O(1). [A potential that dips below its start](#example:potential-below-start)
- Confusing amortized with expected. Expected cost averages over random choices, such as a random pivot or a hash function. Amortized cost averages over a sequence and involves no randomness at all. A hash table's O(1) insert is both: expected because of the hashing, amortized because of the resizing.
- Reading "O(1) amortized" as "every operation is O(1)". Most are. If one slow operation would hurt, as in a game frame or an audio callback, the worst case is the number that matters.
- Picking a Φ that does not match the structure. 2·size − capacity is right for doubling, but at a growth factor of 1.5 it lets the amortized cost of a grow climb with n. The potential has to fit the rule.

## Try this

- [Three coins per append pay for doubling](#example:doubling-coins). Before each copy, guess whose coin pays for it.
- [Two coins per append run out](#example:charge-too-small). Why is the bank back above zero after the 8th append? Would it stay there?
- [Growing by 4 makes the average climb](#example:constant-growth). Then switch **Array grows to** to 2 × capacity and compare the lower charts.
- Run 16 increments with the potential method. Which increment has the largest actual cost, and what is its amortized cost?
- [The most expensive append so far](#example:expensive-append). What would the 33rd append cost?

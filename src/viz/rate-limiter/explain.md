# Rate limiter

A sign-in form, a public API, a chat server: each wants to say "at most L requests per W seconds" and turn away the rest. Easy to say. The obvious design has a hole at every window edge, and fixing the hole costs either memory or exactness. This page runs the same request times through four designs, so you can see what each one lets through and what it keeps.

Times are whole seconds here, the limit is L = 3 and the window W = 10 seconds unless you change them. "The last W seconds" at time t means (t − W, t]: a request exactly W seconds old has left.

## The idea

| Design | What it keeps per client | Cost per request | Most let through in any W seconds |
|---|---|---|---|
| fixed window counter | the window's start and a count: 2 numbers | O(1) | 2L |
| sliding log | the time of each request let through in the last W seconds: up to L | O(1) amortized, O(L) worst | L, exactly |
| sliding window counter | the window's start, prev and curr: 3 numbers | O(1) | near L on smooth traffic, up to 2L at worst |
| token bucket | the tokens and the last refill: 2 numbers | O(1) | close to 2L, on purpose |

The time line shows each request over its second: a ring once it is let through, a crossed square once it is refused. Under the axis, a bracket covers the last W seconds and says how many got through. The cells below are everything the limiter remembers. [Show me](#play:counter-estimate)

The **Limiter** option picks the design. The variables count `memory kept` (numbers stored right now), `requests checked`, and `busiest 10 s`, the most requests let through in any 10 seconds so far. Press Compare and pick this page with other options to run two designs side by side.

## The obvious design: a fixed window

Cut time into windows [0, 10), [10, 20) and so on, keep a count for the current one, and let a request through while the count is under L. When a request lands in a new window, start the count over. Two numbers, one comparison. This is the naive design on this page.

The trouble is the edge. [The burst at a window edge](#example:edge-burst) sends requests at 7, 8, 9, 10, 11, 12, 13 and 21. 7, 8 and 9 use up [0, 10). At 10 the count starts over, so 10, 11 and 12 pass too. That is 6 requests in the 10 seconds (2, 12], twice the limit, and the limiter never noticed. Any fixed window lets up to 2L through in W seconds: L at the end of one window and L at the start of the next. [Show me](#play:edge-burst)

```check
Q: A fixed window counter allows 3 requests per 10 seconds. Requests arrive at 9, 9, 9, 10, 10, 10. How many pass?
- 3
- 4
* 6
- 5
= The three at 9 fill [0, 10). At 10 the count starts over, so the three at 10 pass as well: 6 requests in 2 seconds.
```

## A sliding log

To count the last W seconds exactly, remember when each request got through. The sliding log keeps those times, oldest first. A request at t first drops every logged time at or before t − W, then passes if fewer than L are left, and its time joins the end. It is a [queue](/queue-array/) of times: in at the back, out at the front. It is also a [sliding window](/sliding-window/), over time instead of over an array.

[The log counts exactly](#example:log-is-exact) runs the same requests. 7, 8 and 9 fill the log, so 10, 11, 12 and 13 are all refused: the last 10 seconds already hold 3. At 21 the log drops 7, 8 and 9 in one go and lets 21 through. Four pass, against seven for the fixed window, and `busiest 10 s` never goes past 3.

The price is memory: one time for every request let through in the last W seconds. With L = 3 that is nothing. With L = 1,000 per hour and a million clients, it is up to a billion times. Each request is O(1) amortized, since a time is dropped once, but one request can drop L of them: in [A flood at one second](#example:flood), the request at 20 drops all three.

## A sliding window counter

Can we get close to the log with a few numbers? Keep the fixed windows, but remember two counts: curr for the current window and prev for the one before. The last W seconds cover all of the current window so far and the end of the previous one. If the request comes e seconds into its window, they still cover W − e seconds of the previous window, so take that share of prev:

estimate = curr + prev × (W − e) / W

and let the request through while the estimate is under L.

In [Estimating the last 10 seconds](#example:counter-estimate), the request at 10 starts a new window with prev = 3. It covers all of the previous window: estimate = 0 + 3 × 1 = 3, refused. At 11, e = 1, so estimate = 0 + 3 × 0.9 = 2.7, under 3: it passes. At 12 the estimate is 1 + 3 × 0.8 = 3.4, refused. Three numbers, and much closer to the log than the fixed window: 5 pass, not 7.

It is an estimate, though. It assumes the previous window's requests were spread evenly across it. At 11 it let in a fourth request in (1, 11], since the three before it came late in their window. Push that to the edge and it is as bad as the fixed window: send requests at 9, 9 and 9, then at 18, 18 and 18. At 18 the counter counts only 0.2 of the three at 9, so all three at 18 pass, 6 in (8, 18]. [The estimate guesses wrong](#example:estimate-too-strict) goes the other way: three requests at 0, then two at 12. The counter still counts 0.8 of those three, so the second request at 12 sees 1 + 2.4 = 3.4 and is refused, though only one request came in (2, 12]. The log lets it through.

```check
Q: A sliding window counter allows 5 per 10 seconds. prev = 4 and curr = 1, and a request comes 3 seconds into the current window. What is the estimate, and does it pass?
* 3.8, and it passes
- 2.2, and it passes
- 5, and it is refused
- 4.2, and it passes
= The last 10 seconds still cover 7 of the previous window's 10 seconds: 1 + 4 × 0.7 = 3.8, under 5.
```

## A token bucket

A different question: what rate should a client keep up on average, and how big a burst is fine? A token bucket holds at most L tokens and gains them at a steady rate, here L every W seconds (0.3 a second). Each request takes a token; with less than one left, it is refused. There is no timer: the refill is worked out when a request comes, from the time since the last one. Two numbers again.

[A bucket drains and refills](#example:bucket-refills) starts full. 7, 8 and 9 take three tokens and leave 0.6. One second later 10 finds 0.9 and is refused; 11 finds 1.2 and passes. By 21 the bucket is full again. The same five pass as with the counter, for different reasons.

The bucket allows bursts on purpose. A client that saved up a full bucket can spend it all at once, then carry on at the steady rate. [A long quiet saves only a full bucket](#example:quiet-then-burst) shows the cap: 30 quiet seconds are worth 9 tokens, but the bucket holds 3, so only three of the four requests at 30 pass.

## When to use which

- **Fixed window:** cheapest of all, fine when a double burst at the edge does no harm (a daily quota, say). Not when "at most L in any W seconds" really matters.
- **Sliding log:** exact. Use it when L is small, or when being exact is the whole point (sign-in attempts). Avoid it for big limits across many clients.
- **Sliding window counter:** a sensible default for many clients and big limits: three numbers, and the error is small when traffic is smooth. Cloudflare, which uses it, checked it on 400 million real requests and found 0.003% let through or refused wrongly.
- **Token bucket:** when the rule is a rate with room for bursts, "about 600 an hour, up to 20 at once". The capacity and the rate are two separate knobs; this page ties them to L and W so all four designs share one long-run rate.

When every request is evenly spaced under the limit, they all agree: [Evenly spaced: everyone agrees](#example:steady-under-limit) lets all 8 through, whatever the design.

## Spot it

A rate limiter is a design question more than a pattern, but it has its cues:

- **"at most N per minute"**, **"in any 10 seconds"**, **"per rolling hour"**: a limit over a moving window of time;
- **"turn away"**, **"reject"**, **"throttle"**, **"as each request comes in"**: decide online, one request at a time, before seeing the future;
- **"on average"** with **"bursts of up to"**: a token bucket;
- **"millions of users"**, **"a few numbers per user"**: memory matters, so not a log.

Three problems of our own:

- A sign-in page must turn away anyone who tries more than 5 passwords in any 10 minutes, counting exactly. (A sliding log of the last 5 attempts that got through.)
- A public API allows each key 600 calls an hour on average, and a burst of up to 20 at once. (A token bucket of 20, refilled at 600 an hour.)
- A chat server with millions of users mutes anyone posting more than 3 messages in 5 seconds, keeping only a few numbers per user. (A sliding window counter.)

Look-alikes: "given yesterday's request times, find the busiest minute" knows every time up front and refuses nothing, so it is a plain [sliding window](/sliding-window/) over sorted times. "The largest reading in the last 10 minutes" is a moving maximum, a [monotonic queue](/monotonic-queue/).

## Common mistakes

- Reading a fixed window as "at most L in any W seconds". It is at most L per window, and up to 2L in W seconds across an edge.
- An off-by-one at the window's edge. The last W seconds are (t − W, t], so drop a logged time when it is at or before t − W. Dropping only those before it keeps each time one second too long.
- Logging refused requests too. Then a client that keeps trying is refused for as long as it keeps trying. Some designs want that; this page logs only the requests let through.
- Tokens in floating point. With 0.1 tokens a second, 0.7 + 0.1 + 0.1 + 0.1 comes out as 0.9999999999999999, and a request that should pass is refused. The code here counts tenths of a token (units of 1/W) in whole numbers.
- Refilling the bucket on a timer, for every client. Work it out when a request comes.
- Forgetting that a whole quiet window makes prev 0, not the old curr. The counter's prev is the window just before this one.

## Try this

- [The burst at a window edge](#example:edge-burst): before you play it, guess `busiest 10 s`. Then switch the Limiter to the sliding log and play it again.
- Press Compare, pick this page with other options, and set one side to the fixed window. Start over with "A burst at a window edge" and watch the two time lines.
- [The estimate guesses wrong](#example:estimate-too-strict): what would the sliding log say to the second request at 12? Switch and check.
- Set the window to 2 seconds and the limit to 1, then type 0 1 1 2 3 3 4 for each design. Which one refuses the most?
- [A long quiet saves only a full bucket](#example:quiet-then-burst) with Limit 6: how many of the four at 30 pass now?

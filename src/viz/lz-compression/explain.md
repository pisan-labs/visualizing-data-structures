# LZ77 and LZW compression

Every zip file, every PNG and most web pages you load are compressed with an idea from 1977: when you see something you have seen before, say where, not what. Abraham Lempel and Jacob Ziv wrote two papers, one in 1977 and one in 1978, and almost every general-purpose compressor since descends from one or the other. This page shows LZ77, which points back into the text, and LZW, Terry Welch's 1984 version of the 1978 scheme, which builds a dictionary.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| LZ77 encode | Write (offset, length, next) triples into a sliding window | O(n·W·A) as drawn |
| LZ77 decode | Copy length characters from offset back, add next | O(n) |
| LZW encode | Write the code of the longest known string, learn one more | O(n) |
| LZW decode | Rebuild the same dictionary from the codes | O(n) |

The ratio on this page counts bits: 8 per input character, and for the output what a decoder would need. An LZ77 triple takes enough bits for an offset up to W, a length up to the lookahead, and one byte. An LZW code takes 9 bits, enough for 512 codes.

## LZ77: point back into the window

The encoder stands at a position. Behind it is the window, the last W characters (shaded). Ahead is the lookahead, the next A characters. It finds the longest string in the window that matches the start of the lookahead and writes (offset, length, next): go back offset, copy length characters, then add next. With no match it writes (0, 0, c). [LZ77: pointers back into the window](#example:lz77-encode) [Show me](#play:lz77-encode)

The drawing tries every offset and puts the candidate under the lookahead, so you can see how far it matches. abababcababc becomes (0,0,a) (0,0,b) (2,4,c) (5,4,c): four triples, 60 bits for 96.

Here is the strange part. A copy may run into the characters it is writing. After one a, the triple (1, 6, a) copies from one back six times, and each copy reads the character it just wrote. The decoder copies one character at a time, so this just works. [A copy that overlaps itself](#example:overlap-copy) [Show me](#play:overlap-copy)

```check
Q: The decoder has written abc. What does the triple (3, 5, d) add?
- abcd
* abcabd
- abcab
- abcabcd
= Copy one at a time from 3 back: a, b, c, then a and b, which this same triple wrote a moment ago. Then add d. The text becomes abcabcabd.
```

## LZW: grow a dictionary

LZW sends no offsets. It starts with every single byte in a dictionary, codes 0 to 255. It reads the longest string w that is already in the dictionary, writes w's code, and adds w plus the next character as a new code, 256, 257 and so on. Then it starts again from that next character.

The decoder never receives the dictionary. It starts with the same 256 bytes and, after each code, adds the previous string plus the first character of the current one. That is exactly what the encoder added, one step later. [LZW: the dictionary grows as it reads](#example:lzw-grows) [Show me](#play:lzw-grows)

There is one trap. Sometimes a code arrives that the decoder has not made yet: the encoder created it and used it on the same step. That only happens when the string is the previous string plus its own first character, so the decoder can work it out. abababab… hits it.

```check
Q: LZW on abab writes 97 (a), 98 (b), then 256. What is code 256?
- a
- ba
* ab
- aba
= The first string learned is the first code's string plus the next character: a + b.
```

## Window size and what it misses

LZ77 can only point back W characters. [A window too small to see the repeat](#example:small-window): abcabcabcabc repeats every 3 characters, but with W = 2 the encoder cannot see that far, so it writes twelve plain characters. Set the window to 8 and the same text shrinks. gzip uses a window of 32 KB; newer tools use megabytes.

And when there are no repeats at all, both methods make things bigger. [No repeats: the output is bigger](#example:no-repeats): every character costs a whole triple. Short or random data does not compress. Nothing can fix that; there are more long strings than short ones.

## When to use it

LZ77 and its descendants (DEFLATE in zip, gzip and PNG; LZ4; Zstandard; Brotli) are the default for general data. Decoding is a simple loop of copies, which is why it is fast everywhere. Real encoders do not try every offset: they hash the next few characters to find promising starts, and they Huffman-code the triples afterwards.

LZW was in GIF and Unix compress. It is simple and fast, but a patent kept it out of later formats, and LZ77 with Huffman coding compresses better. For text with long-range structure, sort first: the [Burrows-Wheeler transform](/burrows-wheeler/) is what bzip2 uses.

## Common mistakes

- Decoding an overlapping copy with a block copy (memcpy) instead of one character at a time.
- Forgetting the next character, or letting a match run to the very end so there is no next character left.
- Off-by-one in the offset: offset 1 means the character just before, not the current one.
- In LZW, forgetting the code-not-yet-made case, or adding the dictionary entry after writing instead of before using it.

## Try this

- [LZ77: decoding copies one character at a time](#example:lz77-decode). Predict each copied character.
- Load abcabcabcabc and move the window from 2 to 3. What changes?
- Switch **Method** to LZW on the same text and compare the ratios.
- Load a text with no repeats and watch the ratio climb above 100%.

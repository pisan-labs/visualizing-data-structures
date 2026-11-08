# LZ77 writes (offset, length, next) triples: go back offset, copy length
# characters, then add next. LZW writes dictionary codes and learns a new
# string with every code. Both decoders need nothing but the output.


def lz77(text, window=8, lookahead=6):
    triples = []
    pos = 0
    while pos < len(text):
        longest = min(lookahead, len(text) - pos - 1)  # always leave a next
        best_off = best_len = 0
        for d in range(1, min(window, pos) + 1):
            k = 0
            while k < longest and text[pos - d + k] == text[pos + k]:
                k += 1
            if k > best_len:  # nearest wins a tie
                best_off, best_len = d, k
        triples.append((best_off, best_len, text[pos + best_len]))
        pos += best_len + 1
    return triples


def unlz77(triples):
    out = []
    for off, length, nxt in triples:
        for _ in range(length):  # one at a time: a copy may overlap itself
            out.append(out[-off])
        out.append(nxt)
    return "".join(out)


def lzw(text):
    codes = {chr(b): b for b in range(256)}
    out = []
    w = ""
    for c in text:
        if w + c in codes:
            w += c
        else:
            out.append(codes[w])
            codes[w + c] = len(codes)
            w = c
    if w:
        out.append(codes[w])
    return out


def unlzw(codes):
    strings = {b: chr(b) for b in range(256)}
    out = []
    prev = None
    for code in codes:
        if code in strings:
            cur = strings[code]
        else:  # made by the encoder on this very step
            cur = prev + prev[0]
        if prev is not None:
            strings[len(strings)] = prev + cur[0]
        out.append(cur)
        prev = cur
    return "".join(out)

# Test driver: reads one operation per line, prints one result per line. A space is written _.
#   build s:count ...  ->  "<total bits> <symbol>:<code> ..." in symbol order
#   encode <text>      ->  the bits
#   decode <bits>      ->  the text, or "invalid"
# Every correct Huffman tree gives the same total. The codes, and so the decoded text, also
# depend on how ties are broken: this code follows the page's default rule (leaves first, then
# the oldest merged tree), so it prints the same codes as the page with that setting.
import sys

from huffman import build, codes, decode, encode


def main():
    root = table = None
    out = []
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "build":
            counts = {}
            for pair in args:
                s, n = pair.split(":")
                counts[s.replace("_", " ")] = int(n)
            root = build(counts)
            table = codes(root)
            total = sum(n * len(table[s]) for s, n in counts.items())
            pairs = [f"{s.replace(' ', '_')}:{table[s]}" for s in sorted(table)]
            out.append(" ".join([str(total)] + pairs))
        elif op == "encode":
            out.append(encode(args[0].replace("_", " "), table))
        elif op == "decode":
            text = decode(args[0], root)
            out.append("invalid" if text is None else text.replace(" ", "_"))
    print("\n".join(out))


main()

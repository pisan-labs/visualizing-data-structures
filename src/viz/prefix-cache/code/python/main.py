# Test driver: reads one operation per line, prints one result per line.
# "capacity C" starts an empty cache; "request X tokens..." prints
# "X matched m reused r prefilled p evicted e | tree"; "finish X" prints "X done | tree".
# The tree lists each node as tokens_joined:ref:last, with its children in brackets.
import sys

from radix_cache import RadixCache


def tree(node):
    parts = []
    for c in node.children:
        s = f"{'_'.join(c.tokens)}:{c.ref}:{c.last}"
        if c.children:
            s += f"({tree(c)})"
        parts.append(s)
    return " ".join(parts)


def main():
    cache, running = None, {}
    for line in sys.stdin:
        parts = line.split()
        if not parts:
            continue
        op, args = parts[0], parts[1:]
        if op == "capacity":
            cache, running = RadixCache(int(args[0])), {}
        elif op == "request":
            name, tokens = args[0], args[1:]
            node, matched, evicted = cache.request(tokens)
            running[name] = node
            reused = min(matched, len(tokens) - 1)  # the last token always runs
            print(f"{name} matched {matched} reused {reused} prefilled {len(tokens) - reused}"
                  f" evicted {evicted} | {tree(cache.root) or '-'}")
        elif op == "finish":
            cache.finish(running.pop(args[0]))
            print(f"{args[0]} done | {tree(cache.root) or '-'}")


main()

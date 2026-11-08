# Aho-Corasick

Say you have a list of 10,000 banned words and a long text, and you want every occurrence of every word. Running [KMP](/kmp/) once per word reads the text 10,000 times. Alfred Aho and Margaret Corasick had this problem in 1975 (a bibliographic search at Bell Labs) and solved it by reading the text once. Their trick is KMP's failure function, moved from one pattern onto a trie of all of them. Unix `fgrep` used it, and so do virus scanners and network intrusion detectors.

## The idea

| Operation | What it does | Cost |
|---|---|---|
| build the trie | One path per pattern, shared prefixes shared | O(m), m = total pattern length |
| build links | A failure link and an output link per node, breadth first | O(m) |
| `search(T)` | Every occurrence of every pattern, in one pass | O(n + z), z = matches |

Every node of the trie spells a string: the root spells nothing, and the node under h, e spells he. A ringed node ends a pattern. [Three matches in ushers](#example:ushers) [Show me](#play:ushers)

## Failure links

Scanning the text, keep a current node: the longest suffix of what you have read that is also a node of the trie. Read the next character. If the node has an edge for it, take the edge. If not, the node's failure link says where to try next: the node for the longest proper suffix of its string that is also in the trie. Follow failure links until some node has the edge, or you reach the root.

So in ushers, after reading ush the scan is at sh. The next character e has an edge, giving she. Then r: she has no r edge. she's failure link goes to he (he is the longest suffix of she in the trie), he has an r edge, and the scan goes on to her, then hers. The text pointer never moves back.

Links to the root are left out of the drawing; most nodes have one, and drawn they hide everything else.

```check
Q: Patterns he, she, his, hers. Where does the failure link of the node for his go?
- the root
- h
* s
- hi
= The proper suffixes of his are is and s. is is not in the trie (no pattern starts with is); s is, as the start of she.
```

## Building the links level by level

A node's failure link is found from its parent's. For node v, reached from u by character c: take u's failure node, and if it has a c edge, that child is v's link. If not, follow failure links from there, as the scan would. Because every link points to a shallower node, setting them in breadth-first order means every link you need is already there. [Failure links, level by level](#example:build-links) [Show me](#play:build-links)

The cost argument is KMP's: along any one pattern, the depth of the failure node goes up by at most one per character and every hop takes it down, so the hops cannot outnumber the characters.

## Patterns inside patterns

At she, the scan reports she. But he ends there too, and nothing at the she node mentions it. Two fixes, both on the **Patterns inside patterns** option:

- Output links: each node points to the nearest node down its failure chain that ends a pattern. After reporting the current node's pattern, follow output links until they run out. Each link followed is a match, so the work is O(z). [Output links collect the short patterns](#example:output-links)
- Output sets: while building, each node copies its failure node's list into its own. Reporting is just reading the list. This is what the 1975 paper does; it costs more memory when patterns nest deeply. [The same with output sets](#example:output-sets)

Without either, you would walk the whole failure chain at every character to find short patterns, which costs O(n·m) on bad inputs.

```check
Q: Patterns a, ab, bab, bc, bca, c, caa. The scan stands at the node for bca. Which patterns end here?
- bca only
- bca and ca
* bca and a
- bca, ca and a
= bca ends here. Its failure link goes to ca, which is not a pattern, and ca's own output link points to a. So the output link of bca is a.
```

## When to use it

Use it for many fixed patterns against a lot of text: dictionaries of keywords, virus signatures, DNA probes, filtering words in chat. The links are built once; any number of texts can be scanned with them. Here, Add pattern clears the links and the next search rebuilds them.

For one pattern, KMP or [Boyer-Moore](/boyer-moore/) is simpler. For patterns with wildcards or classes, use [regular expression engines](/regex-engines/); a trie cannot hold them. And when the text is fixed and the patterns keep changing, build an index of the text instead, such as a [suffix array](/suffix-array/).

## Common mistakes

- Building the links depth first. A node's parent's link might not exist yet.
- Linking a node to itself. For a depth-1 node the "longest proper suffix" is empty, so the link is the root.
- Forgetting patterns that end inside others: report only the current node's pattern and he goes missing from ushers.
- Restarting at the root after a mismatch. That is brute force again; the failure link is the whole point.

## Try this

- [DNA: failure links keep the scan moving](#example:dna). Find the hop that saves the CAT starting inside GCA.
- [Adding a pattern clears the links](#example:add-pattern). Which new failure links appear once is is in the trie?
- Search hershe and count the failure-link hops before you press.
- Switch the patterns to at, art, oars, soar and search soars.

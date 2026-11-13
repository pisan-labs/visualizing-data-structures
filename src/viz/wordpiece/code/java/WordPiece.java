import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** WordPiece: build a vocabulary from a text's words, then split words by longest match. */
public class WordPiece {
    public static final String UNK = "[UNK]";

    public record Pair(String a, String b) {}

    /** The first letter as it is, every other letter as a ## piece. */
    public static List<String> split(String word) {
        List<String> out = new ArrayList<>();
        word.codePoints().forEach(c -> out.add((out.isEmpty() ? "" : "##") + Character.toString(c)));
        return out;
    }

    /** The piece a merge makes: b loses its ##. */
    public static String join(String a, String b) {
        return a + (b.startsWith("##") ? b.substring(2) : b);
    }

    static List<String> mergePair(List<String> pieces, Pair p) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < pieces.size(); i++) {
            if (i + 1 < pieces.size() && pieces.get(i).equals(p.a()) && pieces.get(i + 1).equals(p.b())) {
                out.add(join(p.a(), p.b()));
                i++;
            } else {
                out.add(pieces.get(i));
            }
        }
        return out;
    }

    /**
     * Learns up to k merges and returns them in order. words maps each word, as its pieces, to
     * its count, in the order the words appear; it is updated to the merged pieces.
     */
    public static List<Pair> train(Map<List<String>, Integer> words, int k) {
        List<Pair> merges = new ArrayList<>();
        for (int round = 0; round < k; round++) {
            Map<String, Integer> count = new HashMap<>();
            Map<Pair, Integer> pairs = new LinkedHashMap<>(); // keeps the order pairs are met
            words.forEach((pieces, c) -> {
                for (String p : pieces) count.merge(p, c, Integer::sum);
                for (int i = 0; i + 1 < pieces.size(); i++)
                    pairs.merge(new Pair(pieces.get(i), pieces.get(i + 1)), c, Integer::sum);
            });
            Pair best = null;
            double bestScore = -1;
            for (var e : pairs.entrySet()) {
                Pair p = e.getKey();
                double score = (double) e.getValue() / ((double) count.get(p.a()) * count.get(p.b()));
                if (score > bestScore) { // strictly better, so a tie keeps the pair met first
                    best = p;
                    bestScore = score;
                }
            }
            if (best == null) break; // every word is one piece
            merges.add(best);
            Map<List<String>, Integer> next = new LinkedHashMap<>();
            for (var e : words.entrySet()) next.put(mergePair(e.getKey(), best), e.getValue());
            words.clear();
            words.putAll(next);
        }
        return merges;
    }

    /** A trie of the vocabulary, one level per letter; ## pieces hang under # and #. */
    public static class Node {
        final Map<String, Node> kids = new HashMap<>();
        boolean end; // a piece ends here
    }

    public static Node buildTrie(Collection<String> vocab) {
        Node root = new Node();
        for (String piece : vocab) {
            Node node = root;
            for (String ch : piece.codePoints().mapToObj(Character::toString).toList())
                node = node.kids.computeIfAbsent(ch, x -> new Node());
            node.end = true;
        }
        return root;
    }

    /** Greedy longest match first, as BERT does it. */
    public static List<String> encode(String word, Node trie, int maxLen) {
        List<String> letters = word.codePoints().mapToObj(Character::toString).toList();
        if (letters.size() > maxLen) return List.of(UNK);
        List<String> pieces = new ArrayList<>();
        Node inner = trie.kids.getOrDefault("#", new Node()).kids.getOrDefault("#", new Node());
        int start = 0;
        while (start < letters.size()) {
            Node node = start == 0 ? trie : inner;
            int last = -1;
            for (int i = start; i < letters.size() && node.kids.containsKey(letters.get(i)); i++) {
                node = node.kids.get(letters.get(i)); // walk down the trie
                if (node.end) last = i + 1; // the longest piece so far
            }
            if (last < 0) return List.of(UNK); // nothing fits: the whole word is unknown
            pieces.add((start > 0 ? "##" : "") + String.join("", letters.subList(start, last)));
            start = last;
        }
        return pieces;
    }
}

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Byte-pair encoding: learn merges from a text's words, then encode new words with them. */
public class Bpe {
    public static final String END = "_"; // marks the end of a word

    public record Pair(String a, String b) {
        boolean before(Pair o) {
            int c = a.compareTo(o.a);
            return c < 0 || (c == 0 && b.compareTo(o.b) < 0);
        }
    }

    /** A word as its characters, then the end-of-word marker. */
    public static List<String> split(String word) {
        List<String> out = new ArrayList<>();
        word.codePoints().forEach(c -> out.add(Character.toString(c)));
        out.add(END);
        return out;
    }

    /** Neighbouring pairs, each word counted as often as it occurs, in the order first met. */
    static Map<Pair, Integer> countPairs(Map<List<String>, Integer> words) {
        Map<Pair, Integer> pairs = new LinkedHashMap<>();
        words.forEach((tokens, count) -> {
            for (int i = 0; i + 1 < tokens.size(); i++)
                pairs.merge(new Pair(tokens.get(i), tokens.get(i + 1)), count, Integer::sum);
        });
        return pairs;
    }

    /** Join every a followed by b into one token, left to right. */
    static List<String> mergePair(List<String> tokens, Pair p) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < tokens.size(); i++) {
            if (i + 1 < tokens.size() && tokens.get(i).equals(p.a()) && tokens.get(i + 1).equals(p.b())) {
                out.add(p.a() + p.b());
                i++;
            } else {
                out.add(tokens.get(i));
            }
        }
        return out;
    }

    /**
     * Learns up to k merges and returns them in order. words maps each word, as its tokens, to
     * its count, in the order the words appear; it is updated to the merged tokens.
     */
    public static List<Pair> train(Map<List<String>, Integer> words, int k, boolean alphabetical) {
        List<Pair> merges = new ArrayList<>();
        for (int round = 0; round < k; round++) {
            Map<Pair, Integer> pairs = countPairs(words);
            Pair best = null;
            for (var e : pairs.entrySet()) {
                int c = e.getValue();
                if (best == null || c > pairs.get(best)
                        || (alphabetical && c == pairs.get(best) && e.getKey().before(best)))
                    best = e.getKey();
            }
            if (best == null) break; // every word is a single token
            merges.add(best);
            Map<List<String>, Integer> next = new LinkedHashMap<>();
            for (var e : words.entrySet()) next.put(mergePair(e.getKey(), best), e.getValue());
            words.clear();
            words.putAll(next);
        }
        return merges;
    }

    /** Replay the merges, in the order learned, on a new word's tokens. */
    public static List<String> encode(List<String> tokens, List<Pair> merges, Set<String> alphabet) {
        List<String> out = new ArrayList<>();
        for (String t : tokens) out.add(alphabet.contains(t) ? t : "[UNK]");
        for (Pair p : merges) out = mergePair(out, p);
        return out;
    }
}

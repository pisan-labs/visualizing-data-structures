import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** A unigram tokenizer: a seed vocabulary, the best split by Viterbi, and one pruning round. */
public class Unigram {
    static final String UNK = "[UNK]";
    static final double EPS = 1e-9; // scores closer than this count as equal: the first wins

    record Split(List<String> pieces, double score) {}

    /**
     * Every letter, plus the size most frequent substrings of 2+ letters seen at least twice.
     * Returns piece to count: letters A to Z, then by count, length and first appearance.
     */
    static LinkedHashMap<String, Integer> seedVocab(List<String> words, List<Integer> counts,
                                                    int size) {
        TreeMap<String, Integer> letters = new TreeMap<>();
        LinkedHashMap<String, Integer> subs = new LinkedHashMap<>(); // in order of first appearance
        for (int w = 0; w < words.size(); w++) {
            String word = words.get(w);
            int count = counts.get(w);
            for (int i = 0; i < word.length(); i++) {
                letters.merge(word.substring(i, i + 1), count, Integer::sum);
                for (int j = i + 2; j <= word.length(); j++)
                    subs.merge(word.substring(i, j), count, Integer::sum);
            }
        }
        List<String> common = new ArrayList<>();
        for (var e : subs.entrySet()) if (e.getValue() >= 2) common.add(e.getKey());
        // A stable sort keeps first appearance among equals.
        common.sort((a, b) -> subs.get(a).equals(subs.get(b))
                ? b.length() - a.length() : subs.get(b) - subs.get(a));
        LinkedHashMap<String, Integer> vocab = new LinkedHashMap<>(letters);
        for (String s : common.subList(0, Math.min(size, common.size()))) vocab.put(s, subs.get(s));
        return vocab;
    }

    /** log p(x) = log(count(x) / total count). */
    static Map<String, Double> logProbs(Map<String, Integer> vocab) {
        long total = 0;
        for (int c : vocab.values()) total += c;
        Map<String, Double> logp = new LinkedHashMap<>();
        for (var e : vocab.entrySet())
            logp.put(e.getKey(), StrictMath.log((double) e.getValue() / total));
        return logp;
    }

    /**
     * The most probable split of word and its log-probability. best[j] is the best score of the
     * first j letters; a letter the vocabulary lacks becomes [UNK], 10 below the rarest piece.
     */
    static Split viterbi(String word, Map<String, Double> logp, String skip) {
        double unk = 0;
        for (double lp : logp.values()) unk = Math.min(unk, lp);
        unk -= 10;
        int n = word.length();
        double[] best = new double[n + 1];
        int[] from = new int[n + 1];
        String[] piece = new String[n + 1];
        for (int j = 1; j <= n; j++) {
            best[j] = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < j; i++) { // the longest piece ending at j first
                String x = word.substring(i, j);
                double lp;
                if (logp.containsKey(x) && !x.equals(skip)) lp = logp.get(x);
                else if (j == i + 1 && !logp.containsKey(x)) {
                    x = UNK;
                    lp = unk;
                } else continue;
                if (best[i] + lp > best[j] + EPS) {
                    best[j] = best[i] + lp;
                    from[j] = i;
                    piece[j] = x;
                }
            }
        }
        List<String> pieces = new ArrayList<>();
        for (int j = n; j > 0; j = from[j]) pieces.add(0, piece[j]);
        return new Split(pieces, best[n]);
    }

    /**
     * One round: remove the cheapest fifth of the pieces of 2+ letters, never going below
     * floor. A piece's loss is how much the text's log-likelihood drops without it.
     */
    static List<String> prune(List<String> words, List<Integer> counts,
                              LinkedHashMap<String, Integer> vocab, int floor) {
        Map<String, Double> logp = logProbs(vocab);
        List<Split> now = new ArrayList<>();
        for (String w : words) now.add(viterbi(w, logp, null));
        List<String> pieces = new ArrayList<>();
        List<Integer> ranks = new ArrayList<>();
        List<Double> losses = new ArrayList<>();
        int rank = 0;
        for (String x : vocab.keySet()) {
            rank++;
            if (x.length() < 2) continue; // letters always stay
            double loss = 0;
            for (int w = 0; w < words.size(); w++)
                if (now.get(w).pieces().contains(x))
                    loss += counts.get(w)
                            * (now.get(w).score() - viterbi(words.get(w), logp, x).score());
            pieces.add(x);
            ranks.add(rank);
            losses.add(loss);
        }
        int n = pieces.size();
        int remove = Math.max(0, Math.min(n - (int) (n * 0.8), n - floor));
        List<String> removed = new ArrayList<>();
        for (int r = 0; r < remove; r++) {
            int k = 0;
            for (int i = 1; i < pieces.size(); i++) {
                double a = losses.get(i), b = losses.get(k);
                if (a < b - EPS || (Math.abs(a - b) <= EPS && ranks.get(i) > ranks.get(k))) k = i;
            }
            removed.add(pieces.remove(k));
            ranks.remove(k);
            losses.remove(k);
        }
        for (String x : removed) vocab.remove(x);
        return removed;
    }
}

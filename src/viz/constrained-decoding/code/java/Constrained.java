import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Constrained decoding: a DFA, the index of allowed tokens per state, and masked decoding. */
public class Constrained {
    static final String END = "</s>";

    record Dfa(String start, Set<String> accept, List<String> states,
               Map<String, String> delta) {
        String move(String q, char c) {
            return delta.get(q + ":" + c);
        }
    }

    /**
     * The state token ends in from q, or null if a letter has no move (the text would leave the
     * regex). </s> reads nothing and is allowed only in an accepting state.
     */
    static String walk(Dfa dfa, String q, String token) {
        if (token.equals(END)) return dfa.accept().contains(q) ? q : null;
        for (char c : token.toCharArray()) {
            q = dfa.move(q, c);
            if (q == null) return null;
        }
        return q;
    }

    /** For each state, every token that keeps the text on the DFA, with the state it ends in. */
    static Map<String, LinkedHashMap<String, String>> buildIndex(Dfa dfa, List<String> vocab) {
        Map<String, LinkedHashMap<String, String>> index = new HashMap<>();
        for (String q : dfa.states()) {
            LinkedHashMap<String, String> row = new LinkedHashMap<>();
            for (String t : vocab) {
                String to = walk(dfa, q, t);
                if (to != null) row.put(t, to);
            }
            index.put(q, row);
        }
        return index;
    }

    static double[] softmax(double[] z) {
        double m = Double.NEGATIVE_INFINITY;
        for (double v : z) m = Math.max(m, v);
        double[] e = new double[z.length];
        double total = 0;
        for (int i = 0; i < z.length; i++) {
            e[i] = StrictMath.exp(z[i] - m);
            total += e[i];
        }
        for (int i = 0; i < z.length; i++) e[i] /= total;
        return e;
    }

    /**
     * Set the logits of tokens not in allowed to -infinity (allowed null: no mask), then take
     * the most likely token, or the one whose stretch of [0, 1) holds u, in vocabulary order.
     */
    static String nextToken(List<String> vocab, double[] logits, Map<String, String> allowed,
                            boolean greedy, double u) {
        double[] z = new double[logits.length];
        for (int k = 0; k < z.length; k++)
            z[k] = allowed == null || allowed.containsKey(vocab.get(k))
                    ? logits[k] : Double.NEGATIVE_INFINITY;
        double[] p = softmax(z);
        if (greedy) {
            int best = 0;
            for (int k = 1; k < p.length; k++) if (p[k] > p[best]) best = k;
            return vocab.get(best);
        }
        double cum = 0;
        int last = 0;
        for (int k = 0; k < p.length; k++) {
            cum += p[k];
            if (u < cum) return vocab.get(k);
            if (p[k] > 0) last = k;
        }
        return vocab.get(last);
    }
}

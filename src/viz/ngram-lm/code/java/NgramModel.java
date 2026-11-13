import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** An n-gram language model from counts, with add-k smoothing (k = 0: none). */
public class NgramModel {
    static final String BOS = "<s>", EOS = "</s>";

    /** A token that can come next, with its probability. */
    public record Choice(String word, double p) {}

    final int n;
    final double k;
    final Map<String, Map<String, Integer>> counts = new HashMap<>(); // context -> next -> count
    final Map<String, Integer> totals = new HashMap<>(); // context -> tokens after it
    final TreeSet<String> vocab = new TreeSet<>(); // every token that can come next

    NgramModel(int n, double k) {
        this.n = n;
        this.k = k;
    }

    List<String> pad(List<String> words) {
        List<String> t = new ArrayList<>();
        for (int i = 0; i < n - 1; i++) t.add(BOS);
        t.addAll(words);
        t.add(EOS);
        return t;
    }

    void train(List<String> words) {
        List<String> t = pad(words);
        for (int i = n - 1; i < t.size(); i++) {
            String context = String.join(" ", t.subList(i - n + 1, i));
            counts.computeIfAbsent(context, c -> new HashMap<>()).merge(t.get(i), 1, Integer::sum);
            totals.merge(context, 1, Integer::sum);
            vocab.add(t.get(i));
        }
    }

    /** P(word | context) = (C(context word) + k) / (C(context) + k V). */
    double prob(List<String> context, String word) {
        String c = String.join(" ", context);
        double denominator = totals.getOrDefault(c, 0) + k * vocab.size();
        if (denominator == 0) return 0; // a context never seen, and no smoothing
        return (counts.getOrDefault(c, Map.of()).getOrDefault(word, 0) + k) / denominator;
    }

    /** Every token with a probability above 0, most likely first, ties alphabetical. */
    List<Choice> nextWords(List<String> context) {
        List<Choice> out = new ArrayList<>();
        for (String w : vocab) {
            double p = prob(context, w);
            if (p > 0) out.add(new Choice(w, p));
        }
        out.sort(Comparator.comparingDouble((Choice c) -> -c.p()).thenComparing(Choice::word));
        return out;
    }

    /** Draw tokens until </s>, using one uniform number in [0, 1) per token. */
    List<String> generate(double[] uniforms, int maxWords) {
        List<String> context = new ArrayList<>(), words = new ArrayList<>();
        for (int i = 0; i < n - 1; i++) context.add(BOS);
        int next = 0;
        while (words.size() < maxWords) {
            double u = uniforms[next++], total = 0;
            String word = null;
            for (Choice c : nextWords(context)) {
                total += c.p();
                word = c.word();
                if (u < total) break; // u lands in this word's stretch
            }
            words.add(word);
            if (word.equals(EOS)) break;
            context.add(word);
            context.remove(0);
        }
        return words;
    }

    /** P(sentence) ^ (-1 / N), over the N tokens after the start (</s> included). */
    double perplexity(List<String> words) {
        List<String> t = pad(words);
        double logProb = 0;
        for (int i = n - 1; i < t.size(); i++) {
            double p = prob(t.subList(i - n + 1, i), t.get(i));
            if (p == 0) return Double.POSITIVE_INFINITY; // one unseen n-gram: impossible
            logProb += StrictMath.log(p);
        }
        return StrictMath.exp(-logProb / (t.size() - (n - 1)));
    }
}

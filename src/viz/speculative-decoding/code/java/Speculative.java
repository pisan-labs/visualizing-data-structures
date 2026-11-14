import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Speculative decoding: a small model drafts k words, one pass of a large model checks them. */
public class Speculative {
    static final String END = "</s>";

    /** P(w | the n-1 words before it), by counting; null for a context never seen. */
    static Function<List<String>, Map<String, Double>> ngramModel(List<String> sentences, int n) {
        Map<List<String>, Map<String, Integer>> counts = new HashMap<>();
        for (String s : sentences) {
            List<String> words = new ArrayList<>(Collections.nCopies(n - 1, "<s>"));
            Collections.addAll(words, s.split(" "));
            words.add(END);
            for (int i = n - 1; i < words.size(); i++)
                counts.computeIfAbsent(List.copyOf(words.subList(i - n + 1, i)),
                        c -> new LinkedHashMap<>()).merge(words.get(i), 1, Integer::sum);
        }
        return prefix -> {
            List<String> padded = new ArrayList<>(Collections.nCopies(n - 1, "<s>"));
            padded.addAll(prefix);
            Map<String, Integer> row = counts.get(padded.subList(padded.size() - n + 1, padded.size()));
            if (row == null) return null;
            int total = 0;
            for (int c : row.values()) total += c;
            Map<String, Double> dist = new LinkedHashMap<>();
            for (var e : row.entrySet()) dist.put(e.getKey(), (double) e.getValue() / total);
            return dist;
        };
    }

    /** Most likely first, ties alphabetical. */
    static List<String> ordered(Map<String, Double> dist) {
        List<String> ws = new ArrayList<>(dist.keySet());
        ws.sort((a, b) -> dist.get(a).equals(dist.get(b)) ? a.compareTo(b)
                : Double.compare(dist.get(b), dist.get(a)));
        return ws;
    }

    /** The word whose stretch of [0, 1) holds u, laying the words end to end. */
    static String draw(Map<String, Double> dist, double u) {
        List<String> ws = ordered(dist);
        double cum = 0;
        for (String w : ws) {
            cum += dist.get(w);
            if (u < cum) return w;
        }
        return ws.get(ws.size() - 1);
    }

    /** norm(max(0, p - q)): what the target wanted more than the draft gave. */
    static Map<String, Double> leftover(Map<String, Double> p, Map<String, Double> q) {
        Map<String, Double> r = new LinkedHashMap<>();
        double total = 0;
        for (String w : ordered(p)) {
            double v = p.get(w) - q.getOrDefault(w, 0.0);
            if (v > 0) {
                r.put(w, v);
                total += v;
            }
        }
        for (var e : r.entrySet()) e.setValue(e.getValue() / total);
        return r;
    }

    record Result(int accepted, List<String> words) {}

    /** One round: up to k drafts, one target pass, the tests, and the word the target adds. */
    static Result step(List<String> prefix, int k,
                       Function<List<String>, Map<String, Double>> draft,
                       Function<List<String>, Map<String, Double>> target,
                       Iterator<Double> us, boolean greedy) {
        List<String> drafts = new ArrayList<>();
        List<Map<String, Double>> qs = new ArrayList<>();
        for (int i = 0; i < k; i++) {
            List<String> ctx = new ArrayList<>(prefix);
            ctx.addAll(drafts);
            Map<String, Double> q = draft.apply(ctx);
            String x = greedy ? ordered(q).get(0) : draw(q, us.next());
            drafts.add(x);
            qs.add(q);
            if (x.equals(END)) break;
        }
        // One pass of the target: p at every draft position, and after the last one.
        List<Map<String, Double>> ps = new ArrayList<>();
        for (int i = 0; i <= drafts.size(); i++) {
            List<String> ctx = new ArrayList<>(prefix);
            ctx.addAll(drafts.subList(0, i));
            ps.add(target.apply(ctx));
        }
        for (int i = 0; i < drafts.size(); i++) {
            String x = drafts.get(i);
            boolean ok = greedy ? ordered(ps.get(i)).get(0).equals(x)
                    : us.next() < ps.get(i).getOrDefault(x, 0.0) / qs.get(i).get(x);
            if (!ok) {
                List<String> out = new ArrayList<>(drafts.subList(0, i));
                out.add(greedy ? ordered(ps.get(i)).get(0)
                        : draw(leftover(ps.get(i), qs.get(i)), us.next()));
                return new Result(i, out);
            }
        }
        if (!drafts.isEmpty() && drafts.get(drafts.size() - 1).equals(END))
            return new Result(drafts.size(), drafts);
        Map<String, Double> last = ps.get(ps.size() - 1);
        drafts.add(greedy ? ordered(last).get(0) : draw(last, us.next()));
        return new Result(drafts.size() - 1, drafts);
    }
}

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/** Skip-gram with negative sampling. */
public class Word2Vec {
    static double sigmoid(double x) {
        return 1 / (1 + StrictMath.exp(-x));
    }

    static double dot(double[] a, double[] b) {
        double s = 0;
        for (int i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }

    /** (center, context) for each word and every other word at most `window` away. */
    static List<String[]> pairs(List<String> words, int window) {
        List<String[]> out = new ArrayList<>();
        for (int i = 0; i < words.size(); i++)
            for (int j = Math.max(0, i - window); j <= Math.min(words.size() - 1, i + window); j++)
                if (j != i) out.add(new String[] {words.get(i), words.get(j)});
        return out;
    }

    /** P(n) proportional to count(n)^0.75: common words, but less dominant. */
    static Map<String, Double> noiseDistribution(Map<String, Integer> counts) {
        Map<String, Double> weights = new LinkedHashMap<>();
        double total = 0;
        for (var e : counts.entrySet()) {
            double x = StrictMath.pow(e.getValue(), 0.75);
            weights.put(e.getKey(), x);
            total += x;
        }
        for (var e : weights.entrySet()) e.setValue(e.getValue() / total);
        return weights;
    }

    /** The word whose stretch of the cumulative distribution holds u in [0, 1). */
    static String draw(Map<String, Double> noise, double u) {
        double cum = 0;
        String last = null;
        for (var e : noise.entrySet()) {
            cum += e.getValue();
            last = e.getKey();
            if (u < cum) return last;
        }
        return last;
    }

    /** k distinct noise words, never the pair's own words. */
    static List<String> negatives(
            Map<String, Double> noise, int k, String center, String context, DoubleSupplier uniform) {
        List<String> out = new ArrayList<>();
        while (out.size() < k) {
            String n = draw(noise, uniform.getAsDouble());
            if (!n.equals(center) && !n.equals(context) && !out.contains(n)) out.add(n);
        }
        return out;
    }

    /**
     * One step: pull c[context] toward w[center] (want the sigmoid of their dot product to be
     * 1), push each noise word's c away (want 0), then move w[center] by the sum. Returns the
     * sigmoids before the update.
     */
    static double[] update(
            Map<String, double[]> w, Map<String, double[]> c,
            String center, String context, List<String> noiseWords, double lr) {
        double[] v = w.get(center);
        double[] grad = new double[v.length];
        List<String> targets = new ArrayList<>(List.of(context));
        targets.addAll(noiseWords);
        double[] sigmas = new double[targets.size()];
        for (int m = 0; m < targets.size(); m++) {
            double[] ct = c.get(targets.get(m));
            double s = sigmoid(dot(v, ct));
            double g = s - (m == 0 ? 1 : 0);
            double[] moved = new double[v.length];
            for (int i = 0; i < v.length; i++) {
                grad[i] += g * ct[i];
                moved[i] = ct[i] - lr * g * v[i];
            }
            c.put(targets.get(m), moved);
            sigmas[m] = s;
        }
        double[] nv = new double[v.length];
        for (int i = 0; i < v.length; i++) nv[i] = v[i] - lr * grad[i];
        w.put(center, nv);
        return sigmas;
    }
}

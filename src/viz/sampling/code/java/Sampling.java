import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Sampling the next token: temperature, a cut (greedy, top-k, top-p, min-p), then a draw. */
public class Sampling {
    /** Probabilities from logits. Subtracting the largest keeps exp from overflowing. */
    static double[] softmax(double[] logits, double temperature) {
        double m = Double.NEGATIVE_INFINITY;
        for (double x : logits) m = Math.max(m, x / temperature);
        double[] e = new double[logits.length];
        double total = 0;
        for (int i = 0; i < logits.length; i++) {
            e[i] = StrictMath.exp(logits[i] / temperature - m);
            total += e[i];
        }
        for (int i = 0; i < e.length; i++) e[i] /= total;
        return e;
    }

    /** Token indices, largest probability first; ties keep their order (the sort is stable). */
    static List<Integer> mostLikelyFirst(double[] p) {
        Integer[] order = new Integer[p.length];
        for (int i = 0; i < p.length; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> Double.compare(p[b], p[a]));
        return Arrays.asList(order);
    }

    /** The tokens that survive, most likely first. */
    static List<Integer> cut(double[] p, String strategy, int k, double topP, double minP) {
        List<Integer> order = mostLikelyFirst(p);
        switch (strategy) {
            case "greedy":
                return order.subList(0, 1);
            case "top-k":
                return order.subList(0, Math.min(k, order.size()));
            case "top-p": {
                List<Integer> kept = new ArrayList<>();
                double mass = 0;
                for (int i : order) {
                    kept.add(i);
                    mass += p[i];
                    if (mass >= topP) break; // the fewest tokens with at least topP between them
                }
                return kept;
            }
            case "min-p": {
                double floor = minP * p[order.get(0)];
                List<Integer> kept = new ArrayList<>();
                for (int i : order) if (p[i] >= floor) kept.add(i);
                return kept;
            }
            default:
                return order; // plain sampling keeps every token
        }
    }

    /** The kept tokens' probabilities scaled to add up to 1; every other token gets 0. */
    static double[] renormalize(double[] p, List<Integer> kept) {
        double mass = 0;
        for (int i : kept) mass += p[i];
        double[] q = new double[p.length];
        for (int i : kept) q[i] = p[i] / mass;
        return q;
    }

    /** Lay the kept tokens end to end on [0, 1) and return the one whose stretch holds u. */
    static int draw(double[] q, List<Integer> kept, double u) {
        double cum = 0;
        for (int i : kept) {
            cum += q[i];
            if (u < cum) return i;
        }
        return kept.get(kept.size() - 1); // u past the last total by rounding
    }
}

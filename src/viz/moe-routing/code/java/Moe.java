import java.util.ArrayList;
import java.util.List;

/** Mixture-of-experts routing: token choice (top-k, with capacity) or expert choice. */
public class Moe {
    /** One token sent to one expert, with its gate weight; kept is false when dropped. */
    public record Assignment(int token, int expert, double weight, boolean kept) {}

    public record Result(List<Assignment> assignments, int capacity, double loss) {}

    static double[] softmax(double[] scores) {
        double m = Double.NEGATIVE_INFINITY;
        for (double s : scores) m = Math.max(m, s);
        double[] e = new double[scores.length];
        double total = 0;
        for (int j = 0; j < scores.length; j++) {
            e[j] = StrictMath.exp(scores[j] - m);
            total += e[j];
        }
        for (int j = 0; j < e.length; j++) e[j] /= total;
        return e;
    }

    /** Indices of the count largest values, largest first, ties to the lower index. */
    static int[] top(double[] xs, int count) {
        List<Integer> left = new ArrayList<>();
        for (int i = 0; i < xs.length; i++) left.add(i);
        int[] out = new int[Math.min(count, xs.length)];
        for (int n = 0; n < out.length; n++) {
            double best = Double.NEGATIVE_INFINITY;
            for (int i : left) best = Math.max(best, xs[i]);
            int pick = 0;
            for (int i : left)
                if (xs[i] >= best - 1e-12) {
                    pick = i;
                    break;
                }
            out[n] = pick;
            left.remove(Integer.valueOf(pick));
        }
        return out;
    }

    public static Result route(double[][] x, double[][] w, int k, double cf, String routing) {
        int T = x.length, E = w[0].length;
        double[][] logits = new double[T][E], p = new double[T][];
        for (int t = 0; t < T; t++) {
            for (int e = 0; e < E; e++) {
                double s = 0;
                for (int f = 0; f < w.length; f++) s += x[t][f] * w[f][e];
                logits[t][e] = s;
            }
            p[t] = softmax(logits[t]);
        }
        int cap = (int) Math.ceil(cf * k * T / E);
        int[] wanted = new int[E], load = new int[E];
        List<Assignment> out = new ArrayList<>();
        if (routing.equals("token")) {
            int[][] choices = new int[T][];
            double[][] gates = new double[T][];
            for (int t = 0; t < T; t++) {
                choices[t] = top(logits[t], k);
                double[] chosen = new double[k];
                for (int r = 0; r < k; r++) chosen[r] = logits[t][choices[t][r]];
                gates[t] = softmax(chosen);
                for (int e : choices[t]) wanted[e]++;
            }
            for (int r = 0; r < k; r++) // every first choice before any second choice
                for (int t = 0; t < T; t++) {
                    int e = choices[t][r];
                    out.add(new Assignment(t, e, gates[t][r], load[e] < cap));
                    load[e]++;
                }
        } else { // expert choice: each expert takes the cap tokens that want it most
            for (int e = 0; e < E; e++) {
                double[] col = new double[T];
                for (int t = 0; t < T; t++) col[t] = p[t][e];
                for (int t : top(col, cap)) {
                    out.add(new Assignment(t, e, p[t][e], true));
                    wanted[e]++;
                }
            }
        }
        int total = 0;
        for (int c : wanted) total += c;
        double loss = 0;
        for (int e = 0; e < E; e++) {
            double f = (double) wanted[e] / total; // share of the assignments
            double s = 0;
            for (int t = 0; t < T; t++) s += p[t][e];
            loss += f * (s / T); // times the mean router probability
        }
        return new Result(out, cap, E * loss);
    }
}

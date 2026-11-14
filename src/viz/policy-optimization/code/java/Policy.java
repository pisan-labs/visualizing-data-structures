/** Policy optimization on the logits of a policy over a few answers. */
public class Policy {
    static double[] softmax(double[] z) {
        double m = Double.NEGATIVE_INFINITY;
        for (double x : z) m = Math.max(m, x);
        double[] e = new double[z.length];
        double total = 0;
        for (int k = 0; k < z.length; k++) {
            e[k] = StrictMath.exp(z[k] - m);
            total += e[k];
        }
        for (int k = 0; k < z.length; k++) e[k] /= total;
        return e;
    }

    /** The answer whose stretch of 0 to 1, in order, holds u. */
    static int draw(double[] p, double u) {
        double cum = 0;
        for (int k = 0; k < p.length; k++) {
            cum += p[k];
            if (u < cum) return k;
        }
        int k = p.length - 1;
        while (k > 0 && p[k] <= 0) k--;
        return k;
    }

    static double mean(double[] xs) {
        double total = 0;
        for (double x : xs) total += x;
        return total / xs.length;
    }

    /**
     * How much better than expected each sampled answer was. REINFORCE: the reward itself. PPO:
     * the reward minus the critic's value v. Both fold the KL penalty into the reward. GRPO: the
     * reward against the group, (r - mean) / std, with no critic. Returns {advantages, shaped
     * rewards}.
     */
    static double[][] advantages(String method, double[] rewards, int[] group, double[] pOld,
                                 double[] pRef, double beta, double v) {
        int n = group.length;
        double[] r = new double[n];
        for (int i = 0; i < n; i++) r[i] = rewards[group[i]];
        double[] adv = new double[n];
        if (method.equals("grpo")) {
            double m = mean(r);
            double sq = 0;
            for (double x : r) sq += (x - m) * (x - m);
            double std = Math.sqrt(sq / n);
            for (int i = 0; i < n; i++) adv[i] = std > 0 ? (r[i] - m) / std : 0;
            return new double[][] {adv, r};
        }
        double[] shaped = new double[n];
        for (int i = 0; i < n; i++) {
            shaped[i] = r[i] - beta * StrictMath.log(pOld[group[i]] / pRef[group[i]]);
            adv[i] = method.equals("ppo") ? shaped[i] - v : shaped[i];
        }
        return new double[][] {adv, shaped};
    }

    /**
     * One gradient step on the logits from a group of answers. A sample stops counting once its
     * ratio pi/pi_old has left [1 - eps, 1 + eps] the way its advantage pushes (PPO's clip).
     * GRPO also pulls toward pRef. Fills `clipped` and returns the new logits.
     */
    static double[] pass(String method, double[] z, double[] pOld, double[] pRef, int[] group,
                         double[] adv, double eps, double beta, double lr, boolean[] clipped) {
        double[] p = softmax(z);
        double[] g = new double[z.length];
        boolean reinforce = method.equals("reinforce");
        for (int i = 0; i < group.length; i++) {
            int a = group[i];
            double rho = reinforce ? 1 : p[a] / pOld[a];
            double A = adv[i];
            clipped[i] = !reinforce && ((A > 0 && rho > 1 + eps) || (A < 0 && rho < 1 - eps));
            if (!clipped[i]) {
                double coef = A * rho;
                for (int k = 0; k < z.length; k++) g[k] += coef * ((k == a ? 1 : 0) - p[k]);
            }
            if (method.equals("grpo")) {
                double kc = -beta * (1 - pRef[a] / p[a]);
                for (int k = 0; k < z.length; k++) g[k] += kc * ((k == a ? 1 : 0) - p[k]);
            }
        }
        double[] out = new double[z.length];
        for (int k = 0; k < z.length; k++) out[k] = z[k] + lr * (g[k] / group.length);
        return out;
    }

    /** DPO on logits: the loss -log sigmoid(h) for one preference pair. Returns h. */
    static double dpo(double[] z, double[] zRef, int winner, int loser, double beta, double lr) {
        double h = beta * ((z[winner] - zRef[winner]) - (z[loser] - zRef[loser]));
        double sig = 1 / (1 + StrictMath.exp(-h));
        double step = lr * beta * (1 - sig);
        z[winner] = z[winner] + step;
        z[loser] = z[loser] - step;
        return h;
    }
}

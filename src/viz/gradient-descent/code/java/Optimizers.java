/** Gradient descent and two of its descendants. Each step takes the point x and the gradient g. */
public class Optimizers {
    public interface Optimizer {
        double[] step(double[] x, double[] g);
    }

    public static class GradientDescent implements Optimizer {
        final double lr;

        public GradientDescent(double lr) {
            this.lr = lr;
        }

        public double[] step(double[] x, double[] g) {
            double[] out = new double[x.length];
            for (int i = 0; i < x.length; i++) out[i] = x[i] - lr * g[i];
            return out;
        }
    }

    /** Polyak's heavy ball: a velocity that keeps beta of itself each step. */
    public static class Momentum implements Optimizer {
        final double lr, beta;
        double[] v;

        public Momentum(double lr, double beta) {
            this.lr = lr;
            this.beta = beta;
        }

        public double[] step(double[] x, double[] g) {
            if (v == null) v = new double[x.length];
            double[] out = new double[x.length];
            for (int i = 0; i < x.length; i++) {
                v[i] = beta * v[i] - lr * g[i];
                out[i] = x[i] + v[i];
            }
            return out;
        }
    }

    /** Kingma and Ba (2015): running averages of g and g squared. */
    public static class Adam implements Optimizer {
        final double lr, beta1, beta2, eps = 1e-8;
        final boolean biasCorrection;
        double[] m, s;
        double b1t = 1, b2t = 1; // beta1^t and beta2^t

        public Adam(double lr, double beta1, double beta2, boolean biasCorrection) {
            this.lr = lr;
            this.beta1 = beta1;
            this.beta2 = beta2;
            this.biasCorrection = biasCorrection;
        }

        public double[] step(double[] x, double[] g) {
            if (m == null) {
                m = new double[x.length];
                s = new double[x.length];
            }
            b1t *= beta1;
            b2t *= beta2;
            double[] out = new double[x.length];
            for (int i = 0; i < x.length; i++) {
                m[i] = beta1 * m[i] + (1 - beta1) * g[i];
                s[i] = beta2 * s[i] + (1 - beta2) * g[i] * g[i];
                double mHat = m[i], sHat = s[i];
                if (biasCorrection) { // both averages start at 0
                    mHat /= 1 - b1t;
                    sHat /= 1 - b2t;
                }
                out[i] = x[i] - lr * mHat / (StrictMath.sqrt(sHat) + eps);
            }
            return out;
        }
    }
}

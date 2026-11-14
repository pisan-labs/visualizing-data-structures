/**
 * Reads one word vector at a time with one memory unit that means "an animal". A word is four
 * numbers: how much it is an animal, a thing, an action and a small word. model is "rnn",
 * "lstm" or "lstm97" (the 1997 cell, with no forget gate). pull is d(memory now) / d(memory
 * after word 1): a product of one factor per step.
 */
public class Recurrent {
    // Hand-made weights. The plain RNN: only an animal writes to the memory.
    static final double[] U = {1, 0, 0, 0};
    // LSTM gates: a weight per feature, the weight on h, the bias.
    static final double[] UF = {-6, 0, 0, 0}, UI = {6, 0, 0, 0}, UG = {2, 0, 0, 0}, UO = {0, 0, 4, 0};
    static final double WF = 0, WI = 0, WG = 0, WO = 0;
    static final double BF = 3, BI = -3, BG = 0, BO = -2;

    final String model;
    final double w;
    double h = 0, c = 0;
    Double pull = null;

    Recurrent(String model, double w) {
        this.model = model;
        this.w = w;
    }

    static double dot(double[] x, double[] u) {
        double s = 0;
        for (int t = 0; t < x.length; t++) s += x[t] * u[t];
        return s;
    }

    static double sigmoid(double z) {
        return 1 / (1 + StrictMath.exp(-z));
    }

    double[] read(double[] x) {
        double factor;
        double[] out;
        if (model.equals("rnn")) {
            h = StrictMath.tanh(w * h + dot(x, U));
            factor = w * (1 - h * h); // the slope of this step
            out = new double[] {h, 0};
        } else {
            double f = model.equals("lstm") ? sigmoid(dot(x, UF) + h * WF + BF) : 1.0;
            double i = sigmoid(dot(x, UI) + h * WI + BI);
            double g = StrictMath.tanh(dot(x, UG) + h * WG + BG);
            double o = sigmoid(dot(x, UO) + h * WO + BO);
            c = f * c + i * g; // keep some of the old, add some new
            h = o * StrictMath.tanh(c);
            factor = f; // the cell's path back is only the forget gate
            out = new double[] {f, i, g, c, o, h, 0};
        }
        pull = pull == null ? 1.0 : pull * factor;
        out[out.length - 1] = pull;
        return out;
    }
}

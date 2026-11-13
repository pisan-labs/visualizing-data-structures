import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;
import java.util.function.UnaryOperator;

/**
 * Test driver: reads one operation per line, prints one result per line. "surface id" picks the
 * loss, "optimizer method lr beta1 beta2 bias" the method and "start x [y]" a starting point and
 * a fresh optimizer; none of them prints. "step" takes one step and prints the new point, three
 * decimals per coordinate.
 */
public class Main {
    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static UnaryOperator<double[]> gradient(String surface) {
        return switch (surface) {
            case "bowl" -> p -> new double[] {2 * p[0]};
            case "wells" -> p -> new double[] {p[0] * p[0] * p[0] - 2 * p[0] + 0.3};
            case "round" -> p -> new double[] {p[0], p[1]};
            case "narrow" -> p -> new double[] {p[0], 10 * p[1]};
            case "valley" -> p -> new double[] {
                -2 * (1 - p[0]) - 20 * p[0] * (p[1] - p[0] * p[0]), 10 * (p[1] - p[0] * p[0])};
            default -> throw new IllegalArgumentException("unknown surface " + surface);
        };
    }

    static Optimizers.Optimizer make(String[] spec) {
        double lr = Double.parseDouble(spec[1]);
        return switch (spec[0]) {
            case "gd" -> new Optimizers.GradientDescent(lr);
            case "momentum" -> new Optimizers.Momentum(lr, Double.parseDouble(spec[2]));
            default -> new Optimizers.Adam(lr, Double.parseDouble(spec[2]),
                    Double.parseDouble(spec[3]), spec[4].equals("1"));
        };
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        UnaryOperator<double[]> grad = null;
        String[] spec = null;
        Optimizers.Optimizer opt = null;
        double[] x = null;
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "surface" -> grad = gradient(p[1]);
                case "optimizer" -> spec = java.util.Arrays.copyOfRange(p, 1, p.length);
                case "start" -> {
                    x = new double[p.length - 1];
                    for (int i = 1; i < p.length; i++) x[i - 1] = Double.parseDouble(p[i]);
                    opt = make(spec);
                }
                case "step" -> {
                    x = opt.step(x, grad.apply(x));
                    StringJoiner j = new StringJoiner(" ");
                    for (double v : x) j.add(three(v));
                    out.append(j).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

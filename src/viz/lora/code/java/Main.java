import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "w" sets the frozen W
 * and "target" the target update (16 numbers each); "adapter r alpha B... A..." starts a new
 * adapter. None prints. "train k" takes k Adam steps and prints the loss, a bar, and the rows of
 * the update; "merge" prints the rows of W + update. Three decimals each.
 */
public class Main {
    static final int D = 4;

    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    static String rows(double[][] m) {
        StringJoiner out = new StringJoiner(" / ");
        for (double[] row : m) {
            StringJoiner r = new StringJoiner(" ");
            for (double v : row) r.add(three(v));
            out.add(r.toString());
        }
        return out.toString();
    }

    static double[][] matrix(String[] p, int from, int rows, int cols) {
        double[][] m = new double[rows][cols];
        for (int i = 0; i < rows * cols; i++) m[i / cols][i % cols] = Double.parseDouble(p[from + i]);
        return m;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        double[][] w = null, target = null;
        LoRA model = null;
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "w" -> w = matrix(p, 1, D, D);
                case "target" -> target = matrix(p, 1, D, D);
                case "adapter" -> {
                    int r = Integer.parseInt(p[1]);
                    double alpha = Integer.parseInt(p[2]);
                    model = new LoRA(w, matrix(p, 3, D, r), matrix(p, 3 + D * r, r, D), alpha, 0.1);
                }
                case "train" -> {
                    int k = Integer.parseInt(p[1]);
                    for (int t = 0; t < k; t++) model.trainStep(target);
                    out.append(three(model.loss(target))).append(" | ").append(rows(model.delta()));
                    out.append('\n');
                }
                case "merge" -> out.append(rows(model.merge())).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

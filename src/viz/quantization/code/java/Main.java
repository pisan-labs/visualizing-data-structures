import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one line per result. "settings bits scheme
 * group" sets the options and "load numbers" the 4 x 6 weights, row by row; neither prints.
 * "quantize" prints the codes, a bar, the decoded weights (three decimals), a bar, and the
 * total |error|.
 */
public class Main {
    static final int ROWS = 4, COLS = 6;

    static String three(double x) {
        long k = (long) Math.floor(Math.abs(x) * 1000 + 0.5);
        String sign = x < 0 && k > 0 ? "-" : "";
        return String.format("%s%d.%03d", sign, k / 1000, k % 1000);
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int bits = 8;
        String scheme = "absmax", group = "tensor";
        double[][] w = new double[ROWS][COLS];
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "settings" -> {
                    bits = Integer.parseInt(p[1]);
                    scheme = p[2];
                    group = p[3];
                }
                case "load" -> {
                    for (int i = 0; i < ROWS * COLS; i++)
                        w[i / COLS][i % COLS] = Double.parseDouble(p[1 + i]);
                }
                case "quantize" -> {
                    int[][] codes = new int[ROWS][COLS];
                    double[][] decoded = new double[ROWS][COLS];
                    Quantize.quantizeMatrix(w, bits, scheme, group, codes, decoded);
                    StringJoiner q = new StringJoiner(" "), d = new StringJoiner(" ");
                    double total = 0;
                    for (int r = 0; r < ROWS; r++)
                        for (int c = 0; c < COLS; c++) {
                            q.add(String.valueOf(codes[r][c]));
                            d.add(three(decoded[r][c]));
                            total += Math.abs(decoded[r][c] - w[r][c]);
                        }
                    out.append(q).append(" | ").append(d).append(" | ").append(three(total));
                    out.append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

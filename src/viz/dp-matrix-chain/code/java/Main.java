import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "cost p0 p1 ... pn" prints the fewest scalar multiplications for the chain;
 * "order p0 p1 ... pn" prints that and the best order as nested brackets.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length < 3) {
                continue;
            }
            int[] p = new int[parts.length - 1];
            for (int k = 0; k < p.length; k++) {
                p[k] = Integer.parseInt(parts[k + 1]);
            }
            int n = p.length - 1;
            long[][][] ms = MatrixChain.order(p);
            switch (parts[0]) {
                case "cost" -> out.append(ms[0][0][n - 1]).append('\n');
                case "order" -> out.append(ms[0][0][n - 1])
                        .append(' ')
                        .append(MatrixChain.parens(ms[1], 0, n - 1))
                        .append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}

import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "revenue p1 p2 ... pn" prints the best revenue for a rod of length n; "cut p1 ...
 * pn" prints the best revenue and the pieces, first piece first.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length < 2) {
                continue;
            }
            int n = parts.length - 1;
            int[] p = new int[n + 1];
            for (int i = 1; i <= n; i++) {
                p[i] = Integer.parseInt(parts[i]);
            }
            int[][] rs = RodCutting.table(p);
            switch (parts[0]) {
                case "revenue" -> out.append(rs[0][n]).append('\n');
                case "cut" -> {
                    out.append(rs[0][n]);
                    for (int piece : RodCutting.pieces(rs[1], n)) {
                        out.append(' ').append(piece);
                    }
                    out.append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}

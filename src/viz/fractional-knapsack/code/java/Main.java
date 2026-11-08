import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "best W w1:v1 w2:v2 ..." prints the most value that fits in capacity W when items
 * can be cut, as a whole number or a fraction in lowest terms, such as 68/3.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length < 3 || !p[0].equals("best")) {
                continue;
            }
            int n = p.length - 2;
            int[] w = new int[n];
            int[] v = new int[n];
            for (int k = 0; k < n; k++) {
                String[] wv = p[k + 2].split(":");
                w[k] = Integer.parseInt(wv[0]);
                v[k] = Integer.parseInt(wv[1]);
            }
            long[] f = FractionalKnapsack.best(w, v, Integer.parseInt(p[1]));
            out.append(f[1] == 1 ? String.valueOf(f[0]) : f[0] + "/" + f[1]).append('\n');
        }
        System.out.print(out);
    }
}

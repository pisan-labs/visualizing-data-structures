import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.Locale;
import java.util.function.ToLongFunction;

/**
 * Test driver: reads one operation per line, prints one result per line. "run insertion 100 800
 * 4821" runs the doubling loop from n = 100 to 800 on seed 4821's inputs and prints "n T b" for
 * each size ("-" for the first b). "count insertion 20000 4821" prints the step count at one
 * size. Inputs: n values from mulberry32(seed + n), each in [-999999, 999999], the same
 * generator the page uses; binary search gets them sorted.
 */
public class Main {
    static int[] makeInput(String name, int n, long seed) {
        int state = (int) (seed + n);
        int[] a = new int[n];
        for (int i = 0; i < n; i++) {
            state += 0x6D2B79F5;
            int t = state;
            t = (t ^ (t >>> 15)) * (t | 1);
            t ^= t + (t ^ (t >>> 7)) * (t | 61);
            long u = (t ^ (t >>> 14)) & 0xFFFFFFFFL;
            a[i] = (int) (-999999 + ((u * 1999999L) >>> 32));
        }
        if (name.equals("binary")) Arrays.sort(a);
        return a;
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length < 4) continue;
            String name = parts[1];
            ToLongFunction<int[]> algorithm = Doubling.algorithm(name);
            if (parts[0].equals("run")) {
                int n = Integer.parseInt(parts[2]);
                int largest = Integer.parseInt(parts[3]);
                long seed = Long.parseLong(parts[4]);
                for (Doubling.Row r :
                        Doubling.doubling(algorithm, m -> makeInput(name, m, seed), n, largest)) {
                    String b = Double.isNaN(r.b()) ? "-" : String.format(Locale.ROOT, "%.2f", r.b());
                    out.append(r.n()).append(' ').append(r.t()).append(' ').append(b).append('\n');
                }
            } else {
                int n = Integer.parseInt(parts[2]);
                long seed = Long.parseLong(parts[3]);
                out.append(algorithm.applyAsLong(makeInput(name, n, seed))).append('\n');
            }
        }
        System.out.print(out);
    }
}

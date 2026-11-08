import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.function.LongUnaryOperator;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   check p q n0 nMax ; F ; G   -> first n that breaks f <= (p/q)*g, or none
 *   find p q nMax ; F ; G       -> smallest n0, or none
 * F and G are terms k:a:b:e:x, meaning k * n^a * lg(n)^b * (2^n)^e * (n!)^x.
 */
public class Main {
    static LongUnaryOperator function(String terms) {
        List<long[]> parts = new ArrayList<>();
        for (String t : terms.trim().split("\\s+")) {
            String[] v = t.split(":");
            long[] p = new long[5];
            for (int i = 0; i < 5; i++) p[i] = Long.parseLong(v[i]);
            parts.add(p);
        }
        return n -> {
            long sum = 0;
            for (long[] p : parts) {
                long v = p[0];
                for (long i = 0; i < p[1]; i++) v *= n;
                for (long i = 0; i < p[2]; i++) v *= Witness.lg(n);
                if (p[3] == 1) v *= 1L << n;
                if (p[4] == 1) for (long i = 2; i <= n; i++) v *= i;
                sum += v;
            }
            return sum;
        };
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            String[] parts = line.split(";");
            String[] w = parts[0].trim().split("\\s+");
            LongUnaryOperator f = function(parts[1]);
            LongUnaryOperator g = function(parts[2]);
            long p = Long.parseLong(w[1]);
            long q = Long.parseLong(w[2]);
            long n = w[0].equals("check")
                    ? Witness.firstFailure(f, g, p, q, Long.parseLong(w[3]), Long.parseLong(w[4]))
                    : Witness.smallestN0(f, g, p, q, Long.parseLong(w[3]));
            out.append(n < 0 ? "none" : String.valueOf(n)).append('\n');
        }
        System.out.print(out);
    }
}

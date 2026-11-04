import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashMap;

/**
 * Test driver: reads "fib n" or "binom n k", one per line, and prints the value, the calls
 * without a memo and the calls with one.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int n = Integer.parseInt(parts[1]);
            long value;
            long plain;
            Recursion.calls = 0;
            if (parts[0].equals("fib")) {
                value = Recursion.fib(n);
                plain = Recursion.calls;
                Recursion.calls = 0;
                Recursion.fib(n, new HashMap<>());
            } else {
                int k = Integer.parseInt(parts[2]);
                value = Recursion.binomial(n, k);
                plain = Recursion.calls;
                Recursion.calls = 0;
                Recursion.binomial(n, k, new Long[n + 1][k + 1]);
            }
            out.append(value).append(' ').append(plain).append(' ').append(Recursion.calls);
            out.append('\n');
        }
        System.out.print(out);
    }
}

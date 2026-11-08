import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: reads one operation per line, prints one result per line. "triangle 8" prints
 * how many times the triangle's innermost line runs for n = 8. "search 8 first" searches
 * a = [1..8] for x placed first, in the middle, or missing.
 */
public class Main {
    static long searchCase(int n, String where) {
        int[] a = new int[n];
        for (int i = 0; i < n; i++) {
            a[i] = i + 1;
        }
        int x = switch (where) {
            case "first" -> a[0];
            case "middle" -> a[(n - 1) / 2];
            default -> n + 1;
        };
        return Loops.search(a, x);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts.length < 2) continue;
            int n = Integer.parseInt(parts[1]);
            long count = switch (parts[0]) {
                case "single" -> Loops.single(n);
                case "nested" -> Loops.nested(n);
                case "triangle" -> Loops.triangle(n);
                case "pairs" -> Loops.pairs(n);
                case "sequence" -> Loops.sequence(n);
                case "halving" -> Loops.halving(n);
                case "sqrt" -> Loops.squareRoot(n);
                case "doubling" -> Loops.doubling(n);
                case "geometric" -> Loops.geometric(n);
                case "search" -> searchCase(n, parts[2]);
                case "triple" -> Loops.triple(n);
                default -> throw new IllegalArgumentException("unknown pattern " + parts[0]);
            };
            out.append(count).append('\n');
        }
        System.out.print(out);
    }
}

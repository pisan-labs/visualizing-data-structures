import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads "gcd a b", "ext a b" or "inverse a m", one per line, prints each result. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            long a = Long.parseLong(p[1]);
            long b = Long.parseLong(p[2]);
            switch (p[0]) {
                case "gcd" -> out.append(Euclid.euclid(a, b)).append('\n');
                case "ext" -> {
                    long[] r = Euclid.extendedEuclid(a, b);
                    out.append(r[0]).append(' ').append(r[1]).append(' ').append(r[2]).append('\n');
                }
                case "inverse" -> {
                    long inv = Euclid.modInverse(a, b);
                    out.append(inv < 0 ? "none" : String.valueOf(inv)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

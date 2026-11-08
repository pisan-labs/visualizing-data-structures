import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: reads "keys p q" and "use-e e" (print "n e d"), "encrypt m" and "decrypt c"
 * (print the result), one per line.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Rsa rsa = null;
        long p = 0, q = 0;
        String line;
        while ((line = in.readLine()) != null) {
            String[] w = line.trim().split("\\s+");
            if (w[0].isEmpty()) continue;
            long x = Long.parseLong(w[1]);
            switch (w[0]) {
                case "keys" -> {
                    p = x;
                    q = Long.parseLong(w[2]);
                    rsa = new Rsa(p, q);
                    out.append(rsa.n + " " + rsa.e + " " + rsa.d).append('\n');
                }
                case "use-e" -> {
                    rsa = new Rsa(p, q, x);
                    out.append(rsa.n + " " + rsa.e + " " + rsa.d).append('\n');
                }
                case "encrypt" -> out.append(rsa.encrypt(x)).append('\n');
                case "decrypt" -> out.append(rsa.decrypt(x)).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + w[0]);
            }
        }
        System.out.print(out);
    }
}

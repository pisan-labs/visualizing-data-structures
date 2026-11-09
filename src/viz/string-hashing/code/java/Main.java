import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "init b p" sets the base and modulus; "load s" hashes the prefixes of s;
 * "prefix" prints h[0..n]; "hash l r" prints the hash of s[l..r]; "compare i j len" prints
 * equal, different or collision; "windows k" prints the hash of every window of k.
 */
public class Main {
    static String join(long[] a) {
        StringJoiner j = new StringJoiner(" ");
        for (long v : a) j.add(String.valueOf(v));
        return j.toString();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        long b = 0, p = 1;
        String s = "";
        StringHash ph = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            switch (a[0]) {
                case "init" -> {
                    b = Long.parseLong(a[1]);
                    p = Long.parseLong(a[2]);
                }
                case "load" -> {
                    s = a[1];
                    ph = new StringHash(s, b, p);
                }
                case "prefix" -> System.out.println(join(ph.h));
                case "hash" -> System.out.println(ph.get(Integer.parseInt(a[1]), Integer.parseInt(a[2])));
                case "compare" -> {
                    int i = Integer.parseInt(a[1]), j = Integer.parseInt(a[2]), n = Integer.parseInt(a[3]);
                    if (ph.get(i, i + n - 1) != ph.get(j, j + n - 1)) System.out.println("different");
                    else System.out.println(s.substring(i, i + n).equals(s.substring(j, j + n)) ? "equal" : "collision");
                }
                case "windows" -> System.out.println(join(StringHash.windowHashes(s, Integer.parseInt(a[1]), b, p)));
                default -> {}
            }
        }
    }
}

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.StringJoiner;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "pair t" prints "lo hi" or "none"; "water"
 * prints the most water; "dedupe" keeps a[0..k-1] and prints "k: ..."; "reverse" prints the
 * reversed array.
 */
public class Main {
    static String join(int[] a) {
        StringJoiner j = new StringJoiner(" ");
        for (int v : a) j.add(String.valueOf(v));
        return j.toString();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] a = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> {
                    a = new int[p.length - 1];
                    for (int i = 1; i < p.length; i++) a[i - 1] = Integer.parseInt(p[i]);
                }
                case "pair" -> {
                    int[] f = TwoPointers.pairSum(a, Integer.parseInt(p[1]));
                    System.out.println(f == null ? "none" : f[0] + " " + f[1]);
                }
                case "water" -> System.out.println(TwoPointers.maxWater(a));
                case "dedupe" -> {
                    int k = TwoPointers.removeDuplicates(a);
                    a = Arrays.copyOf(a, k);
                    System.out.println(k + ": " + join(a));
                }
                case "reverse" -> {
                    TwoPointers.reverse(a);
                    System.out.println(join(a));
                }
                default -> {}
            }
        }
    }
}

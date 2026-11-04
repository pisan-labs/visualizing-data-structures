import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "sort lo hi d" sorts it with buckets over
 * [lo, hi) and prints it with d decimals.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        double[] a = new double[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> a = Arrays.stream(p, 1, p.length)
                        .mapToDouble(Double::parseDouble)
                        .toArray();
                case "sort" -> {
                    BucketSort.sort(a, Double.parseDouble(p[1]), Double.parseDouble(p[2]));
                    String format = "%." + Integer.parseInt(p[3]) + "f";
                    out.append(Arrays.stream(a)
                            .mapToObj(x -> String.format(Locale.ROOT, format, x))
                            .collect(Collectors.joining(" ")))
                        .append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}

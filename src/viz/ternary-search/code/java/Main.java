import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "search x" prints the index of x; "max"
 * prints the index of the peak.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        int[] a = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            switch (parts[0]) {
                case "load" -> a = Arrays.stream(parts, 1, parts.length)
                        .mapToInt(Integer::parseInt)
                        .toArray();
                case "search" -> out.append(TernarySearch.search(a, Integer.parseInt(parts[1])))
                        .append('\n');
                case "max" -> out.append(TernarySearch.max(a)).append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}

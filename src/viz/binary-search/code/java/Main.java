import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;

/**
 * Test driver: "load v1 v2 ..." replaces the sorted array. "search x", "first x", "lower x",
 * "upper x" and "locate x" print what that method returns.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        int[] a = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].equals("load")) {
                a = Arrays.stream(parts, 1, parts.length).mapToInt(Integer::parseInt).toArray();
                continue;
            }
            if (parts.length < 2) {
                continue;
            }
            int x = Integer.parseInt(parts[1]);
            switch (parts[0]) {
                case "search" -> out.append(BinarySearch.search(a, x)).append('\n');
                case "first" -> out.append(BinarySearch.first(a, x)).append('\n');
                case "lower" -> out.append(BinarySearch.lowerBound(a, x)).append('\n');
                case "upper" -> out.append(BinarySearch.upperBound(a, x)).append('\n');
                case "locate" -> out.append(BinarySearch.locate(a, x)).append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.stream.Collectors;

/** Test driver: "load v1 v2 ..." replaces the array; "sort" sorts it and prints it. */
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
                case "sort" -> {
                    GnomeSort.sort(a);
                    out.append(Arrays.stream(a)
                            .mapToObj(String::valueOf)
                            .collect(Collectors.joining(" ")))
                        .append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}

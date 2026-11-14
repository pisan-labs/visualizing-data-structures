import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "merge s-f ..." prints the merged list; "insert x s-f ..." inserts x into the
 * list; "intersect s-f ... | s-f ..." prints what two lists have in common. Each prints its
 * intervals as s-f separated by spaces, or "none".
 */
public class Main {
    static int[][] read(String[] tokens) {
        int[][] out = new int[tokens.length][];
        for (int k = 0; k < tokens.length; k++) {
            String[] p = tokens[k].split("-");
            out[k] = new int[] {Integer.parseInt(p[0]), Integer.parseInt(p[1])};
        }
        return out;
    }

    static String show(List<int[]> ivs) {
        if (ivs.isEmpty()) return "none";
        StringJoiner j = new StringJoiner(" ");
        for (int[] iv : ivs) j.add(iv[0] + "-" + iv[1]);
        return j.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        for (String line; (line = in.readLine()) != null; ) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            String[] rest = Arrays.copyOfRange(p, 1, p.length);
            switch (p[0]) {
                case "merge" -> out.append(show(Intervals.merge(read(rest)))).append('\n');
                case "insert" -> out.append(show(Intervals.insert(
                        read(Arrays.copyOfRange(rest, 1, rest.length)), read(rest)[0])))
                        .append('\n');
                case "intersect" -> {
                    int bar = Arrays.asList(rest).indexOf("|");
                    int[][] a = read(Arrays.copyOfRange(rest, 0, bar));
                    int[][] b = read(Arrays.copyOfRange(rest, bar + 1, rest.length));
                    out.append(show(Intervals.intersect(a, b))).append('\n');
                }
                default -> { }
            }
        }
        System.out.print(out);
    }
}

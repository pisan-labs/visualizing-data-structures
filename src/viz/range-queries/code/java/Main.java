import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: reads one operation per line, prints one line per query result.
 * build 5 3 8 1 | sum i j | min i j | update i x
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        PrefixSums sums = null;
        SparseTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "build" -> {
                    sums = new PrefixSums(args);
                    table = new SparseTable(args);
                }
                case "sum" -> out.append(sums.sum(args[0], args[1])).append('\n');
                case "min" -> out.append(table.min(args[0], args[1])).append('\n');
                case "update" -> {
                    sums.update(args[0], args[1]);
                    table.update(args[0], args[1]);
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

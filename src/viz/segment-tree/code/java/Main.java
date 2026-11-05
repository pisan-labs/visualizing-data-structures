import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: reads one operation per line, prints one line per query result.
 * build 5 3 8 1 | query l r | update i x | add l r x
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        SegmentTree tree = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int[] args = new int[parts.length - 1];
            for (int k = 1; k < parts.length; k++) args[k - 1] = Integer.parseInt(parts[k]);
            switch (parts[0]) {
                case "build" -> tree = new SegmentTree(args);
                case "query" -> out.append(tree.query(args[0], args[1])).append('\n');
                case "update" -> tree.update(args[0], args[1]);
                case "add" -> tree.add(args[0], args[1], args[2]);
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

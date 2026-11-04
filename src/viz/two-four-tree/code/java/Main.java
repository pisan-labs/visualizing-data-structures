import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static String keysLine(TwoFourTree tree) {
        StringBuilder sb = new StringBuilder("ok");
        for (int k : tree.keys()) sb.append(' ').append(k);
        return sb.toString();
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        TwoFourTree tree = new TwoFourTree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result = switch (parts[0]) {
                case "insert" -> tree.insert(k) ? keysLine(tree) : "duplicate";
                case "delete" -> tree.delete(k) ? keysLine(tree) : "missing";
                case "search" -> tree.search(k) ? "found" : "missing";
                case "clear" -> {
                    tree = new TwoFourTree();
                    yield "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

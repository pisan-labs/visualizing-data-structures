import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static String join(String head, List<Integer> keys) {
        StringBuilder sb = new StringBuilder(head);
        for (int k : keys) sb.append(sb.length() > 0 ? " " : "").append(k);
        return sb.toString();
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        BPlusTree tree = new BPlusTree(4);
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int a = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            int b = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
            String result = switch (parts[0]) {
                case "insert" -> tree.insert(a) ? join("ok", tree.keys()) : "duplicate";
                case "delete" -> tree.delete(a) ? join("ok", tree.keys()) : "missing";
                case "search" -> tree.search(a) ? "found" : "missing";
                case "range" -> {
                    List<Integer> keys = tree.range(a, b);
                    yield keys.isEmpty() ? "empty" : join("", keys);
                }
                case "clear" -> {
                    tree = new BPlusTree(4);
                    yield "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

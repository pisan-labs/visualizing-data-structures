import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;

/**
 * Test driver: reads one operation per line, prints one result per line.
 *   insert w | delete w  ->  "ok <words> <nodes>" (the root counts as a node), or
 *                            "duplicate" / "missing"
 *   search w             ->  "found" or "missing"
 *   startswith p         ->  the words, in order, or "none"
 *   clear                ->  "ok"
 */
public class Main {
    /** Words and nodes in the subtree at x. */
    static int[] count(RadixTree.Node x) {
        int[] total = {x.end ? 1 : 0, 1};
        for (RadixTree.Node y : x.children.values()) {
            int[] sub = count(y);
            total[0] += sub[0];
            total[1] += sub[1];
        }
        return total;
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        RadixTree tree = new RadixTree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            String arg = parts.length > 1 ? parts[1] : "";
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    boolean done = parts[0].equals("insert") ? tree.insert(arg) : tree.delete(arg);
                    if (done) {
                        int[] c = count(tree.root);
                        result = "ok " + c[0] + " " + c[1];
                    } else {
                        result = parts[0].equals("insert") ? "duplicate" : "missing";
                    }
                }
                case "search" -> result = tree.search(arg) ? "found" : "missing";
                case "startswith" -> {
                    List<String> words = tree.startsWith(arg);
                    result = words.isEmpty() ? "none" : String.join(" ", words);
                }
                case "clear" -> {
                    tree = new RadixTree();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

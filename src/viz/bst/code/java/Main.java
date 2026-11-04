import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static String keyOr(BST<Integer>.Node x, String missing) {
        return x == null ? missing : String.valueOf(x.key);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        BST<Integer> tree = new BST<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result = switch (parts[0]) {
                case "insert", "delete" -> {
                    boolean done = parts[0].equals("insert") ? tree.insert(k) : tree.delete(k);
                    if (!done) {
                        yield parts[0].equals("insert") ? "duplicate" : "missing";
                    }
                    yield "ok " + BST.size(tree.root) + " " + tree.height(tree.root);
                }
                case "search" -> tree.search(k) != null ? "found" : "missing";
                case "min" -> tree.root == null ? "empty" : keyOr(tree.minimum(tree.root), "");
                case "max" -> tree.root == null ? "empty" : keyOr(tree.maximum(tree.root), "");
                case "successor", "predecessor" -> {
                    BST<Integer>.Node x = tree.search(k);
                    if (x == null) {
                        yield "missing";
                    }
                    yield keyOr(
                            parts[0].equals("successor") ? tree.successor(x) : tree.predecessor(x),
                            "none");
                }
                case "select" -> keyOr(tree.select(k), "none");
                case "rank" -> {
                    int r = tree.rank(k);
                    yield r < 0 ? "missing" : String.valueOf(r);
                }
                case "lowerbound" -> keyOr(tree.lowerBound(k), "none");
                case "inorder" -> {
                    List<Integer> keys = new ArrayList<>();
                    tree.inorder(tree.root, keys);
                    List<String> words = new ArrayList<>();
                    for (int key : keys) {
                        words.add(String.valueOf(key));
                    }
                    yield words.isEmpty() ? "empty" : String.join(" ", words);
                }
                case "clear" -> {
                    tree.root = null;
                    yield "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

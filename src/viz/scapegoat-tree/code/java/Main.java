import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(ScapegoatTree.Node x, List<String> out) {
        if (x == null) return;
        out.add(String.valueOf(x.key));
        preorder(x.left, out);
        preorder(x.right, out);
    }

    static void inorder(ScapegoatTree.Node x, List<String> out) {
        if (x == null) return;
        inorder(x.left, out);
        out.add(String.valueOf(x.key));
        inorder(x.right, out);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        ScapegoatTree tree = new ScapegoatTree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    int before = tree.rebuilds;
                    boolean insert = parts[0].equals("insert");
                    boolean done = insert ? tree.insert(k) : tree.delete(k);
                    if (done) {
                        List<String> words = new ArrayList<>(List.of("ok",
                                String.valueOf(tree.n),
                                String.valueOf(tree.height(tree.root)),
                                String.valueOf(tree.rebuilds - before)));
                        preorder(tree.root, words);
                        result = String.join(" ", words);
                    } else {
                        result = insert ? "duplicate" : "missing";
                    }
                }
                case "search" -> result = tree.search(k) != null ? "found" : "missing";
                case "inorder" -> {
                    List<String> keys = new ArrayList<>();
                    inorder(tree.root, keys);
                    result = keys.isEmpty() ? "empty" : String.join(" ", keys);
                }
                case "clear" -> {
                    tree = new ScapegoatTree();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

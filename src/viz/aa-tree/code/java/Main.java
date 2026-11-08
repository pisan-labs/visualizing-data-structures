import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(AATree.Node t, List<String> out) {
        if (t == null) return;
        out.add(t.key + ":" + t.level);
        preorder(t.left, out);
        preorder(t.right, out);
    }

    static void inorder(AATree.Node t, List<String> out) {
        if (t == null) return;
        inorder(t.left, out);
        out.add(String.valueOf(t.key));
        inorder(t.right, out);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        AATree tree = new AATree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    int skews = tree.skews;
                    int splits = tree.splits;
                    boolean insert = parts[0].equals("insert");
                    boolean done = insert ? tree.insert(k) : tree.delete(k);
                    if (done) {
                        List<String> words = new ArrayList<>(List.of("ok",
                                String.valueOf(tree.size),
                                String.valueOf(tree.skews - skews),
                                String.valueOf(tree.splits - splits)));
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
                    tree = new AATree();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

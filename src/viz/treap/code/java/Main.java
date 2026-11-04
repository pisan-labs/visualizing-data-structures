import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(Treap<Integer>.Node x, List<String> out) {
        if (x != null) {
            out.add(x.key + ":" + x.priority);
            preorder(x.left, out);
            preorder(x.right, out);
        }
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Treap<Integer> tree = new Treap<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    int before = tree.rotations;
                    boolean insert = parts[0].equals("insert");
                    boolean done = insert ? tree.insert(k, Integer.parseInt(parts[2])) : tree.delete(k);
                    if (done) {
                        List<String> words = new ArrayList<>(List.of("ok",
                                String.valueOf(tree.size),
                                String.valueOf(tree.height(tree.root)),
                                String.valueOf(tree.rotations - before)));
                        preorder(tree.root, words);
                        result = String.join(" ", words);
                    } else {
                        result = insert ? "duplicate" : "missing";
                    }
                }
                case "search" -> result = tree.search(k) != null ? "found" : "missing";
                case "min" -> result = tree.root == null ? "empty" : String.valueOf(tree.minimum().key);
                case "max" -> result = tree.root == null ? "empty" : String.valueOf(tree.maximum().key);
                case "inorder" -> {
                    List<Integer> keys = new ArrayList<>();
                    tree.inorder(tree.root, keys);
                    List<String> words = new ArrayList<>();
                    for (int key : keys) {
                        words.add(String.valueOf(key));
                    }
                    result = words.isEmpty() ? "empty" : String.join(" ", words);
                }
                case "clear" -> {
                    tree = new Treap<>();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

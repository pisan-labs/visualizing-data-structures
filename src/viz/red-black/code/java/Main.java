import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(RedBlackTree<Integer> tree, RedBlackTree<Integer>.Node x, List<String> out) {
        if (x != tree.nil) {
            out.add(x.key + (x.color == RedBlackTree.RED ? "R" : "B"));
            preorder(tree, x.left, out);
            preorder(tree, x.right, out);
        }
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        RedBlackTree<Integer> tree = new RedBlackTree<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    int before = tree.rotations;
                    boolean done = parts[0].equals("insert") ? tree.insert(k) : tree.delete(k);
                    if (done) {
                        List<String> words = new ArrayList<>(List.of("ok",
                                String.valueOf(tree.size),
                                String.valueOf(tree.height(tree.root)),
                                String.valueOf(tree.blackHeight()),
                                String.valueOf(tree.rotations - before)));
                        preorder(tree, tree.root, words);
                        result = String.join(" ", words);
                    } else {
                        result = parts[0].equals("insert") ? "duplicate" : "missing";
                    }
                }
                case "search" -> result = tree.search(k) != tree.nil ? "found" : "missing";
                case "min" -> result = tree.root == tree.nil ? "empty"
                        : String.valueOf(tree.minimum(tree.root).key);
                case "max" -> result = tree.root == tree.nil ? "empty"
                        : String.valueOf(tree.maximum(tree.root).key);
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
                    tree = new RedBlackTree<>();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

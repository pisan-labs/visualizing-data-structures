import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(SplayTree<Integer>.Node x, List<String> out) {
        if (x != null) {
            out.add(String.valueOf(x.key));
            preorder(x.left, out);
            preorder(x.right, out);
        }
    }

    static String line(List<String> words, SplayTree<Integer> tree) {
        preorder(tree.root, words);
        return String.join(" ", words);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        SplayTree<Integer> tree = new SplayTree<>();
        String input;
        while ((input = in.readLine()) != null) {
            String[] parts = input.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            int before = tree.rotations;
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    boolean insert = parts[0].equals("insert");
                    boolean done = insert ? tree.insert(k) : tree.delete(k);
                    String word = done ? "ok" : insert ? "duplicate" : "missing";
                    result = line(new ArrayList<>(List.of(word, String.valueOf(tree.size),
                            String.valueOf(tree.height(tree.root)),
                            String.valueOf(tree.rotations - before))), tree);
                }
                case "search" -> {
                    String word = tree.search(k) ? "found" : "missing";
                    result = line(new ArrayList<>(List.of(word,
                            String.valueOf(tree.rotations - before))), tree);
                }
                case "min", "max" -> {
                    if (tree.root == null) {
                        result = "empty";
                    } else {
                        SplayTree<Integer>.Node x =
                                parts[0].equals("min") ? tree.minimum() : tree.maximum();
                        result = line(new ArrayList<>(List.of(String.valueOf(x.key),
                                String.valueOf(tree.rotations - before))), tree);
                    }
                }
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
                    tree = new SplayTree<>();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

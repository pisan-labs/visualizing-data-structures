import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        BinaryTree<String> tree = new BinaryTree<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            List<String> values = new ArrayList<>();
            switch (parts[0]) {
                case "build" -> {
                    List<String> list = new ArrayList<>();
                    for (int i = 1; i < parts.length; i++) {
                        list.add(parts[i].equals("_") ? null : parts[i]);
                    }
                    tree = BinaryTree.fromLevelOrder(list);
                    out.append(tree.size(tree.root)).append(' ').append(tree.height(tree.root));
                    out.append('\n');
                    continue;
                }
                case "preorder" -> tree.preorder(tree.root, values);
                case "inorder" -> tree.inorder(tree.root, values);
                case "postorder" -> tree.postorder(tree.root, values);
                case "levelorder" -> values = tree.levelOrder();
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(values.isEmpty() ? "empty" : String.join(" ", values)).append('\n');
        }
        System.out.print(out);
    }
}

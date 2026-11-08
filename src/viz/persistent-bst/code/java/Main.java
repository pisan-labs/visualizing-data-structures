import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(PersistentBST.Node x, List<String> out) {
        if (x == null) return;
        out.add(String.valueOf(x.key()));
        preorder(x.left(), out);
        preorder(x.right(), out);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        PersistentBST tree = new PersistentBST();
        int current = 0; // updates apply to the version being viewed
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            if (parts[0].equals("clear")) {
                tree = new PersistentBST();
                current = 0;
                out.append("ok\n");
                continue;
            }
            int n = Integer.parseInt(parts[1]);
            List<String> words = new ArrayList<>();
            switch (parts[0]) {
                case "insert", "delete" -> {
                    boolean insert = parts[0].equals("insert");
                    int v = insert ? tree.insert(current, n) : tree.delete(current, n);
                    if (v < 0) {
                        words.add(insert ? "duplicate" : "missing");
                    } else {
                        current = v;
                        words.add("v" + v);
                        words.add(String.valueOf(tree.made));
                        preorder(tree.versions.get(v), words);
                    }
                }
                case "search" -> words.add(tree.search(current, n) ? "found" : "missing");
                case "view" -> {
                    current = n;
                    words.add("ok");
                    preorder(tree.versions.get(n), words);
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(String.join(" ", words)).append('\n');
        }
        System.out.print(out);
    }
}

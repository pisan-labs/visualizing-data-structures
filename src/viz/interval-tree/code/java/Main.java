import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static void preorder(IntervalTree.Node x, List<String> out) {
        if (x == null) return;
        out.add(x.lo + "," + x.hi + "," + x.max);
        preorder(x.left, out);
        preorder(x.right, out);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        IntervalTree tree = new IntervalTree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            if (parts[0].equals("clear")) {
                tree = new IntervalTree();
                out.append("ok\n");
                continue;
            }
            int lo = Integer.parseInt(parts[1]);
            int hi = Integer.parseInt(parts[2]);
            String result;
            switch (parts[0]) {
                case "insert", "delete" -> {
                    boolean insert = parts[0].equals("insert");
                    boolean done = insert ? tree.insert(lo, hi) : tree.delete(lo, hi);
                    if (done) {
                        List<String> words = new ArrayList<>(List.of("ok",
                                String.valueOf(tree.size), String.valueOf(tree.height(tree.root))));
                        preorder(tree.root, words);
                        result = String.join(" ", words);
                    } else {
                        result = insert ? "duplicate" : "missing";
                    }
                }
                case "overlap" -> {
                    int[] visited = {0};
                    IntervalTree.Node x = tree.overlap(lo, hi, visited);
                    result = (x == null ? "none" : x.lo + "," + x.hi) + " " + visited[0];
                }
                case "all" -> {
                    int[] visited = {0};
                    List<IntervalTree.Node> found = tree.all(lo, hi, visited);
                    List<String> words = new ArrayList<>(List.of(String.valueOf(found.size())));
                    for (IntervalTree.Node x : found) words.add(x.lo + "," + x.hi);
                    words.add("visited");
                    words.add(String.valueOf(visited[0]));
                    result = String.join(" ", words);
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

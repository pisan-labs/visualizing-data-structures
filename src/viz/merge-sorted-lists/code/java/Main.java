import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: "build 1 4 7 | 2 3 8" makes the sorted lists (separated by |, "empty" for an
 * empty one); "merge" merges them all into one and prints its values, or "empty".
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        List<Merge.Node> lists = new ArrayList<>();
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("build")) {
                lists = new ArrayList<>();
                for (String group : line.substring(5).split("\\|")) {
                    String[] words = group.trim().split("\\s+");
                    Merge.Node head = null;
                    for (int i = words.length - 1; i >= 0; i--) {
                        if (words[i].isEmpty() || words[i].equals("empty")) continue;
                        head = new Merge.Node(Integer.parseInt(words[i]), head);
                    }
                    lists.add(head);
                }
            } else if (line.equals("merge")) {
                Merge.Node head = Merge.mergeAll(lists);
                lists = new ArrayList<>();
                lists.add(head);
                StringBuilder vs = new StringBuilder();
                for (Merge.Node n = head; n != null; n = n.next) {
                    if (vs.length() > 0) vs.append(' ');
                    vs.append(n.value);
                }
                out.append(vs.length() > 0 ? vs : "empty").append('\n');
            } else {
                throw new IllegalArgumentException("unknown operation " + line);
            }
        }
        System.out.print(out);
    }
}

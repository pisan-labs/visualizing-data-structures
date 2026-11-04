import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    /** "1 2 3 4 @1": link the nodes in order; the last one points back to index 1. */
    static Floyd.Node<String> build(String[] p) {
        int end = p.length;
        int loop = -1;
        if (end > 1 && p[end - 1].startsWith("@")) {
            loop = Integer.parseInt(p[end - 1].substring(1));
            end--;
        }
        List<Floyd.Node<String>> nodes = new ArrayList<>();
        for (int i = 1; i < end; i++) {
            nodes.add(new Floyd.Node<>(p[i]));
        }
        for (int i = 0; i + 1 < nodes.size(); i++) {
            nodes.get(i).next = nodes.get(i + 1);
        }
        if (loop >= 0) {
            nodes.get(nodes.size() - 1).next = nodes.get(loop);
        }
        return nodes.isEmpty() ? null : nodes.get(0);
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        Floyd.Node<String> head = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "build" -> {
                    head = build(p);
                    out.append("ok\n");
                }
                case "detect" -> {
                    int[] found = Floyd.findCycle(head);
                    out.append(found == null ? "none" : found[0] + " " + found[1]).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

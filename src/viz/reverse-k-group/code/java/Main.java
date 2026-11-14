import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "build v1 v2 ..." makes the list; "reverse k" reverses it in groups of k (a short
 * last group stays), "reverse k all" reverses a short last group too; both print the list.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        ReverseK.Node head = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "build" -> {
                    head = null;
                    for (int i = p.length - 1; i >= 1; i--) {
                        head = new ReverseK.Node(Integer.parseInt(p[i]), head);
                    }
                }
                case "reverse" -> {
                    boolean all = p.length > 2 && p[2].equals("all");
                    head = ReverseK.reverseKGroup(head, Integer.parseInt(p[1]), all);
                    StringBuilder vs = new StringBuilder();
                    for (ReverseK.Node n = head; n != null; n = n.next) {
                        if (vs.length() > 0) vs.append(' ');
                        vs.append(n.value);
                    }
                    out.append(vs).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

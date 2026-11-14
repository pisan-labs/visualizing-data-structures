import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "build v1 v2 ..." makes the list; "middle" (or "middle first") prints the middle
 * value; "kth k" prints the k-th value from the end, or "none"; "palindrome" prints true or
 * false; "list" prints the list.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        FastSlow.Node head = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "build" -> {
                    head = null;
                    for (int i = p.length - 1; i >= 1; i--) {
                        head = new FastSlow.Node(Integer.parseInt(p[i]), head);
                    }
                }
                case "middle" -> {
                    boolean first = p.length > 1 && p[1].equals("first");
                    FastSlow.Node m = first ? FastSlow.firstMiddle(head) : FastSlow.middle(head);
                    out.append(m.value).append('\n');
                }
                case "kth" -> {
                    FastSlow.Node node = FastSlow.kthFromEnd(head, Integer.parseInt(p[1]));
                    out.append(node == null ? "none" : String.valueOf(node.value)).append('\n');
                }
                case "palindrome" -> out.append(FastSlow.isPalindrome(head)).append('\n');
                case "list" -> {
                    StringBuilder vs = new StringBuilder();
                    for (FastSlow.Node n = head; n != null; n = n.next) {
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

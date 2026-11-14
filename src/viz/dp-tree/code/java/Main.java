import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.List;
import java.util.StringJoiner;

/**
 * Test driver: "best v1 v2 ..." builds a tree from a level-order list (_ for a gap) and prints
 * the best total, then the chosen values in preorder.
 */
public class Main {
    static TreeChoice.Node build(String[] t) {
        if (t.length == 0 || t[0].equals("_")) return null;
        TreeChoice.Node root = new TreeChoice.Node(Integer.parseInt(t[0]));
        ArrayDeque<TreeChoice.Node> queue = new ArrayDeque<>();
        queue.add(root);
        int i = 1;
        while (i < t.length && !queue.isEmpty()) {
            TreeChoice.Node node = queue.poll();
            for (int side = 0; side < 2; side++, i++) {
                if (i >= t.length || t[i].equals("_")) continue;
                TreeChoice.Node child = new TreeChoice.Node(Integer.parseInt(t[i]));
                if (side == 0) node.left = child;
                else node.right = child;
                queue.add(child);
            }
        }
        return root;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (!p[0].equals("best")) continue;
            String[] tokens = new String[p.length - 1];
            System.arraycopy(p, 1, tokens, 0, tokens.length);
            List<Integer> r = TreeChoice.bestChoice(build(tokens));
            StringJoiner out = new StringJoiner(" ");
            for (int v : r) out.add(String.valueOf(v));
            System.out.println(out);
        }
    }
}

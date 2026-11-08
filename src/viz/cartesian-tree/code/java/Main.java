import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        CartesianTree tree = new CartesianTree();
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            String result;
            switch (parts[0]) {
                case "append" -> {
                    int pops = tree.append(Integer.parseInt(parts[1]));
                    List<Integer> keys = new ArrayList<>();
                    tree.preorder(tree.root, keys);
                    StringBuilder sb = new StringBuilder("ok " + pops);
                    for (int k : keys) sb.append(' ').append(k);
                    result = sb.toString();
                }
                case "rmq" -> {
                    int a = Integer.parseInt(parts[1]);
                    int b = Integer.parseInt(parts[2]);
                    int i = Math.min(a, b);
                    int j = Math.max(a, b);
                    if (j >= tree.values.size()) {
                        result = "bad";
                    } else {
                        int[] r = tree.rmq(i, j);
                        result = r[0] + " " + tree.values.get(r[0]) + " " + r[1];
                    }
                }
                case "clear" -> {
                    tree = new CartesianTree();
                    result = "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "capacity C" starts an
 * empty cache; "request X tokens..." prints "X matched m reused r prefilled p evicted e | tree";
 * "finish X" prints "X done | tree". The tree lists each node as tokens_joined:ref:last, with
 * its children in brackets.
 */
public class Main {
    static String tree(RadixCache.Node node) {
        StringJoiner out = new StringJoiner(" ");
        for (RadixCache.Node c : node.children) {
            String s = String.join("_", c.tokens) + ":" + c.ref + ":" + c.last;
            if (!c.children.isEmpty()) s += "(" + tree(c) + ")";
            out.add(s);
        }
        return out.toString();
    }

    static String treeOf(RadixCache cache) {
        String t = tree(cache.root);
        return t.isEmpty() ? "-" : t;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        RadixCache cache = null;
        Map<String, RadixCache.Node> running = new HashMap<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "capacity" -> {
                    cache = new RadixCache(Integer.parseInt(p[1]));
                    running.clear();
                }
                case "request" -> {
                    List<String> tokens = Arrays.asList(p).subList(2, p.length);
                    RadixCache.Result r = cache.request(tokens);
                    running.put(p[1], r.node());
                    int reused = Math.min(r.matched(), tokens.size() - 1); // the last token runs
                    out.append(p[1]).append(" matched ").append(r.matched())
                            .append(" reused ").append(reused)
                            .append(" prefilled ").append(tokens.size() - reused)
                            .append(" evicted ").append(r.evicted())
                            .append(" | ").append(treeOf(cache)).append('\n');
                }
                case "finish" -> {
                    cache.finish(running.remove(p[1]));
                    out.append(p[1]).append(" done | ").append(treeOf(cache)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

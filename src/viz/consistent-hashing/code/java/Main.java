import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        HashRing ring = null;
        List<Integer> keys = new ArrayList<>(); // the keys stored, in the order they were added
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> ring = new HashRing(Integer.parseInt(p[1]));
                case "addKey", "lookup" -> {
                    int k = Integer.parseInt(p[1]);
                    if (p[0].equals("addKey") && !keys.contains(k)) keys.add(k);
                    String s = ring.lookup(k);
                    out.append(s == null ? "none" : s).append('\n');
                }
                case "addServer", "removeServer" -> {
                    Map<Integer, String> before = new HashMap<>();
                    for (int k : keys) before.put(k, ring.lookup(k));
                    if (p[0].equals("addServer")) ring.addServer(p[1].charAt(0));
                    else ring.removeServer(p[1].charAt(0));
                    StringBuilder moved = new StringBuilder();
                    for (int k : keys) {
                        if (!Objects.equals(ring.lookup(k), before.get(k))) moved.append(moved.length() > 0 ? " " : "").append(k);
                    }
                    out.append(moved.length() > 0 ? moved : "none").append('\n');
                }
                case "clear" -> {
                    keys.clear();
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

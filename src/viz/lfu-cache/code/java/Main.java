import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LFUCache cache = null;
        int capacity = 0;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    capacity = Integer.parseInt(p[1]);
                    cache = new LFUCache(capacity);
                }
                case "get" -> out.append(cache.get(Integer.parseInt(p[1]))).append('\n');
                case "put" -> {
                    int k = Integer.parseInt(p[1]);
                    boolean existed = cache.contains(k);
                    Integer evicted = cache.put(k, Integer.parseInt(p[2]));
                    out.append(existed ? "updated" : evicted != null ? "evict " + evicted : "added")
                            .append('\n');
                }
                case "clear" -> {
                    cache = new LFUCache(capacity);
                    out.append("ok\n");
                }
                case "print" -> {
                    StringJoiner lists = new StringJoiner(" ");
                    for (Map.Entry<Integer, LinkedHashSet<Integer>> e : cache.lists().entrySet()) {
                        StringJoiner keys = new StringJoiner(",");
                        for (int k : e.getValue()) keys.add(String.valueOf(k));
                        lists.add(e.getKey() + ":" + keys);
                    }
                    String shown = lists.length() == 0 ? "empty" : lists.toString();
                    out.append(shown).append(" | min ").append(cache.minFreq()).append(" | ")
                            .append(cache.hits).append(' ').append(cache.misses).append('\n');
                }
                default -> throw new IllegalArgumentException(p[0]);
            }
        }
        System.out.print(out);
    }
}

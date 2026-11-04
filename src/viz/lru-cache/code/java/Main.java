import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LRUCache cache = null;
        int capacity = 0;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> {
                    capacity = Integer.parseInt(parts[1]);
                    cache = new LRUCache(capacity);
                }
                case "get" -> out.append(cache.get(Integer.parseInt(parts[1]))).append('\n');
                case "put" -> {
                    int k = Integer.parseInt(parts[1]);
                    boolean existed = cache.contains(k);
                    Integer evicted = cache.put(k, Integer.parseInt(parts[2]));
                    if (existed) out.append("updated\n");
                    else if (evicted != null) out.append("evict ").append(evicted).append('\n');
                    else out.append("added\n");
                }
                case "clear" -> {
                    cache = new LRUCache(capacity);
                    out.append("ok\n");
                }
                case "print" -> out.append(cache.show()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

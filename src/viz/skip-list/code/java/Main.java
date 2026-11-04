import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static String keysLine(SkipList list) {
        StringBuilder sb = new StringBuilder("ok");
        for (int k : list.keys()) sb.append(' ').append(k);
        return sb.toString();
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        SkipList list = new SkipList(0.5, 5, 1);
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int k = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            String result = switch (parts[0]) {
                case "insert" -> list.insert(k) ? keysLine(list) : "duplicate";
                case "delete" -> list.delete(k) ? keysLine(list) : "missing";
                case "search" -> list.search(k) ? "found" : "missing";
                case "clear" -> {
                    list = new SkipList(0.5, 5, 1);
                    yield "ok";
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            };
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

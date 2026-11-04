import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        ResizingTable table = null;
        int start = 0;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> {
                    start = Integer.parseInt(parts[1]);
                    table = new ResizingTable(start);
                }
                case "insert" -> {
                    int cost = table.insert(Integer.parseInt(parts[1]));
                    int m = table.capacity();
                    out.append(cost > 0 ? "added " + m + " " + cost : "present " + m).append('\n');
                }
                case "search" -> {
                    int j = table.search(Integer.parseInt(parts[1]));
                    out.append(j < 0 ? "missing" : "found " + j).append('\n');
                }
                case "clear" -> {
                    table = new ResizingTable(start);
                    out.append("ok\n");
                }
                case "print" -> out.append(table.show()).append(" | ").append(table.total()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

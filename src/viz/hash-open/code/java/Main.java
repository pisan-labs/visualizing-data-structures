import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        LinearProbingTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> table = new LinearProbingTable(Integer.parseInt(parts[1]));
                case "insert" -> {
                    try {
                        boolean added = table.insert(Integer.parseInt(parts[1]));
                        out.append(added ? "added " : "present ").append(table.probes()).append('\n');
                    } catch (IllegalStateException e) {
                        out.append("full ").append(table.probes()).append('\n');
                    }
                }
                case "search" -> {
                    int j = table.search(Integer.parseInt(parts[1]));
                    if (j < 0) out.append("missing ").append(table.probes()).append('\n');
                    else out.append("found ").append(j).append(' ').append(table.probes()).append('\n');
                }
                case "delete" -> {
                    boolean deleted = table.delete(Integer.parseInt(parts[1]));
                    out.append(deleted ? "deleted " : "missing ").append(table.probes()).append('\n');
                }
                case "clear" -> {
                    table.clear();
                    out.append("ok\n");
                }
                case "print" -> {
                    StringBuilder row = new StringBuilder();
                    for (int j = 0; j < table.size(); j++) {
                        if (j > 0) row.append(' ');
                        row.append(table.show(j));
                    }
                    out.append(row).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

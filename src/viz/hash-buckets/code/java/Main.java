import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        BucketHashTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> table = new BucketHashTable(
                        Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
                case "insert" -> {
                    boolean added = table.insert(Integer.parseInt(parts[1]));
                    out.append(added ? "added " : "present ").append(table.probes()).append('\n');
                }
                case "search" -> {
                    boolean found = table.search(Integer.parseInt(parts[1]));
                    out.append(found ? "found " : "missing ").append(table.probes()).append('\n');
                }
                case "delete" -> {
                    boolean deleted = table.delete(Integer.parseInt(parts[1]));
                    out.append(deleted ? "deleted " : "missing ").append(table.probes()).append('\n');
                }
                case "clear" -> {
                    table.clear();
                    out.append("ok\n");
                }
                case "print" -> out.append(table.show()).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

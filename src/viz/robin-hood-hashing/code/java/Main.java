import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        RobinHoodTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> table = new RobinHoodTable(Integer.parseInt(p[1]));
                case "insert" -> {
                    try {
                        int swaps = table.insert(Integer.parseInt(p[1]));
                        out.append(swaps < 0 ? "present" : "added " + table.probes() + " " + swaps).append('\n');
                    } catch (IllegalStateException e) {
                        out.append("full\n");
                    }
                }
                case "search" -> {
                    int j = table.search(Integer.parseInt(p[1]));
                    out.append(j < 0 ? "missing " + table.probes() : "found " + j + " " + table.probes()).append('\n');
                }
                case "delete" -> {
                    int shifts = table.delete(Integer.parseInt(p[1]));
                    out.append(shifts < 0 ? "missing" : "deleted " + shifts).append('\n');
                }
                case "clear" -> {
                    table = new RobinHoodTable(table.size());
                    out.append("ok\n");
                }
                case "print" -> {
                    StringBuilder row = new StringBuilder();
                    for (int j = 0; j < table.size(); j++) {
                        int x = table.at(j);
                        row.append(j > 0 ? " " : "").append(x < 0 ? "-" : String.valueOf(x));
                    }
                    out.append(row).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

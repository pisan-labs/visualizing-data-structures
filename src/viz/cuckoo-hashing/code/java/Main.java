import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        CuckooTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> table = new CuckooTable(Integer.parseInt(p[1]));
                case "insert" -> {
                    int before = table.rehashes();
                    if (table.insert(Integer.parseInt(p[1]))) {
                        out.append("added ").append(table.kicks());
                        if (table.rehashes() != before) out.append(" rehash ").append(table.size());
                        out.append('\n');
                    } else {
                        out.append("present\n");
                    }
                }
                case "search" -> {
                    int i = table.search(Integer.parseInt(p[1]));
                    out.append(i != 0 ? "found " + i : "missing").append('\n');
                }
                case "delete" -> out.append(table.delete(Integer.parseInt(p[1])) ? "deleted\n" : "missing\n");
                case "clear" -> {
                    table.clear();
                    out.append("ok\n");
                }
                case "print" -> {
                    for (int i = 0; i < 2; i++) {
                        if (i == 1) out.append(" |");
                        for (int j = 0; j < table.size(); j++) {
                            int x = table.at(i, j);
                            out.append(i == 0 && j == 0 ? "" : " ").append(x < 0 ? "-" : String.valueOf(x));
                        }
                    }
                    out.append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

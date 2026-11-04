import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        ChainedHashTable table = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            switch (parts[0]) {
                case "new" -> table = new ChainedHashTable(Integer.parseInt(parts[1]));
                case "insert" -> {
                    int k = Integer.parseInt(parts[1]);
                    boolean added = table.insert(k);
                    out.append(table.h(k)).append(added ? " added\n" : " present\n");
                }
                case "search" -> {
                    int k = Integer.parseInt(parts[1]);
                    boolean found = table.contains(k);
                    out.append(table.h(k)).append(found ? " found\n" : " missing\n");
                }
                case "delete" -> {
                    int k = Integer.parseInt(parts[1]);
                    boolean deleted = table.delete(k);
                    out.append(table.h(k)).append(deleted ? " deleted\n" : " missing\n");
                }
                case "clear" -> {
                    table.clear();
                    out.append("ok\n");
                }
                case "print" -> {
                    List<String> chains = new ArrayList<>();
                    for (int i = 0; i < table.buckets(); i++) {
                        List<String> keys = new ArrayList<>();
                        for (int k : table.chain(i)) keys.add(String.valueOf(k));
                        chains.add(keys.isEmpty() ? "-" : String.join(" ", keys));
                    }
                    out.append(String.join(" | ", chains)).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

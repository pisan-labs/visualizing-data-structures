import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one line per result. "settings blocks size
 * sharing" starts an empty pool (sharing 1 or 0) and prints nothing. "add n", "step", "finish X"
 * and "fork X" each print every block table, the free list (top first) and how many blocks have
 * been copied.
 */
public class Main {
    static final int MAX_LEN = 16;
    static final String NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    static String stateLine(BlockManager m) {
        StringJoiner tables = new StringJoiner(" / ");
        for (Map.Entry<String, List<Integer>> e : m.tables.entrySet()) {
            StringJoiner t = new StringJoiner(" ");
            t.add(e.getKey());
            for (int p : e.getValue()) t.add(String.valueOf(p));
            tables.add(t.toString());
        }
        StringJoiner free = new StringJoiner(" ");
        for (int p : m.free) free.add(String.valueOf(p)); // top first
        return (m.tables.isEmpty() ? "-" : tables.toString()) + " | free "
                + (m.free.isEmpty() ? "-" : free.toString()) + " | copies " + m.copies;
    }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        BlockManager m = null;
        int named = 0;
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "settings" -> {
                    m = new BlockManager(Integer.parseInt(p[1]), Integer.parseInt(p[2]), MAX_LEN,
                            p[3].equals("1"));
                    named = 0;
                    continue;
                }
                case "add" -> m.add(String.valueOf(NAMES.charAt(named++)), Integer.parseInt(p[1]));
                case "step" -> m.step();
                case "finish" -> m.finish(p[1]);
                case "fork" -> m.fork(p[1], String.valueOf(NAMES.charAt(named++)));
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
            out.append(stateLine(m)).append('\n');
        }
        System.out.print(out);
    }
}

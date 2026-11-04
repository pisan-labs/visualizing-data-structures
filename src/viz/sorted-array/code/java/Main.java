import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        SortedArray array = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            int x = p.length > 1 ? Integer.parseInt(p[1]) : 0;
            String result;
            switch (p[0]) {
                case "new" -> {
                    array = new SortedArray(x);
                    continue;
                }
                case "insert" -> {
                    try {
                        array.insert(x);
                        result = "ok";
                    } catch (IllegalStateException e) {
                        result = "full";
                    }
                }
                case "delete" -> result = array.delete(x) ? "ok" : "missing";
                case "search" -> result = String.valueOf(array.search(x));
                case "contains" -> result = array.search(x) != -1 ? "true" : "false";
                case "min", "max" -> {
                    try {
                        result = String.valueOf(p[0].equals("min") ? array.min() : array.max());
                    } catch (NoSuchElementException e) {
                        result = "empty";
                    }
                }
                case "lowerBound" -> result = String.valueOf(array.lowerBound(x));
                case "upperBound" -> result = String.valueOf(array.upperBound(x));
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

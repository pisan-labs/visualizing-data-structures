import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    private static Integer index(String token) {
        try {
            return Integer.parseInt(token);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        DynamicArray<String> array = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            String result;
            switch (p[0]) {
                case "new" -> {
                    array = new DynamicArray<>(Integer.parseInt(p[1]));
                    continue;
                }
                case "capacity" -> result = String.valueOf(array.capacity());
                case "append" -> {
                    array.append(p[1]);
                    result = "ok";
                }
                case "removeLast" -> {
                    try {
                        result = array.removeLast();
                    } catch (NoSuchElementException e) {
                        result = "empty";
                    }
                }
                default -> {
                    Integer i = index(p[1]);
                    try {
                        if (i == null) throw new IndexOutOfBoundsException("not an index");
                        result = switch (p[0]) {
                            case "insert" -> {
                                array.insert(i, p[2]);
                                yield "ok";
                            }
                            case "removeAt" -> array.removeAt(i);
                            case "get" -> array.get(i);
                            case "set" -> {
                                array.set(i, p[2]);
                                yield "ok";
                            }
                            default -> throw new IllegalArgumentException("unknown operation " + p[0]);
                        };
                    } catch (IndexOutOfBoundsException e) {
                        result = "error";
                    }
                }
            }
            out.append(result).append('\n');
        }
        System.out.print(out);
    }
}

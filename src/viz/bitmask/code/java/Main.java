import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.List;
import java.util.stream.Collectors;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    private static String join(List<Integer> xs) {
        return xs.stream().map(String::valueOf).collect(Collectors.joining(" "));
    }

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        int x = 0;
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split("\\s+");
            if (parts[0].isEmpty()) continue;
            int arg = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            switch (parts[0]) {
                case "load" -> {
                    x = arg;
                    out.append(x).append('\n');
                }
                case "set" -> {
                    x = Bitmask.setBit(x, arg);
                    out.append(x).append('\n');
                }
                case "clear" -> {
                    x = Bitmask.clearBit(x, arg);
                    out.append(x).append('\n');
                }
                case "toggle" -> {
                    x = Bitmask.toggleBit(x, arg);
                    out.append(x).append('\n');
                }
                case "test" -> out.append(Bitmask.testBit(x, arg)).append('\n');
                case "lowbit" -> out.append(Bitmask.lowestBit(x)).append('\n');
                case "popcount" -> out.append(Bitmask.popcount(x)).append('\n');
                case "subsets" -> out.append(join(Bitmask.subsets(arg))).append('\n');
                case "submasks" -> out.append(join(Bitmask.submasks(x))).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + parts[0]);
            }
        }
        System.out.print(out);
    }
}

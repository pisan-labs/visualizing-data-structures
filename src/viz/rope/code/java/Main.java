import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static final int MAX_LEN = 40, MAX_PIECE = 12; // the page's limits

    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        int leaf = 4;
        Rope rope = new Rope();
        Rope other = null;
        String line;
        while ((line = in.readLine()) != null) {
            int sp = line.indexOf(' ');
            String op = sp < 0 ? line : line.substring(0, sp);
            String rest = sp < 0 ? "" : line.substring(sp + 1);
            String[] args = rest.trim().split("\\s+");
            switch (op) {
                case "new" -> leaf = Integer.parseInt(args[0]);
                case "build" -> {
                    rope = Rope.of(rest, leaf);
                    other = null;
                    out.append(rope.length()).append('\n');
                }
                case "index" -> {
                    try {
                        char c = rope.index(Integer.parseInt(args[0]));
                        out.append('"').append(c).append("\"\n");
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "append" -> {
                    if (rope.length() + rest.length() > MAX_LEN || rest.length() > MAX_PIECE) {
                        out.append("invalid\n");
                    } else {
                        rope.append(rest);
                        out.append(rope.length()).append('\n');
                    }
                }
                case "insert" -> {
                    String text = args[1];
                    if (other != null || rope.length() + text.length() > MAX_LEN
                            || text.length() > MAX_PIECE) {
                        out.append("invalid\n");
                        break;
                    }
                    try {
                        rope.insert(Integer.parseInt(args[0]), text);
                        out.append(rope.length()).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "delete" -> {
                    try {
                        if (other != null) throw new IndexOutOfBoundsException("join first");
                        rope.delete(Integer.parseInt(args[0]), Integer.parseInt(args[1]));
                        out.append(rope.length()).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "split" -> {
                    try {
                        if (other != null) throw new IndexOutOfBoundsException("join first");
                        other = rope.split(Integer.parseInt(args[0]));
                        out.append(rope.length()).append(' ').append(other.length()).append('\n');
                    } catch (IndexOutOfBoundsException e) {
                        out.append("invalid\n");
                    }
                }
                case "join" -> {
                    if (other == null) out.append("none\n");
                    else {
                        rope.join(other);
                        other = null;
                        out.append(rope.length()).append('\n');
                    }
                }
                case "clear" -> {
                    rope = new Rope();
                    other = null;
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException("unknown operation " + op);
            }
        }
        System.out.print(out);
    }
}

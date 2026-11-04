import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        CircularLinkedList<String> list = new CircularLinkedList<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "insertFront" -> {
                    list.insertFront(p[1]);
                    out.append("ok\n");
                }
                case "insertBack" -> {
                    list.insertBack(p[1]);
                    out.append("ok\n");
                }
                case "removeFront" -> {
                    try {
                        out.append(list.removeFront()).append('\n');
                    } catch (NoSuchElementException e) {
                        out.append("empty\n");
                    }
                }
                case "rotate" -> {
                    list.rotate();
                    out.append("ok\n");
                }
                case "traverse" -> {
                    String all = String.join(" ", list.traverse());
                    out.append(all.isEmpty() ? "empty" : all).append('\n');
                }
                case "search" -> out.append(list.search(p[1])).append('\n');
                default -> throw new IllegalArgumentException("unknown operation " + p[0]);
            }
        }
        System.out.print(out);
    }
}

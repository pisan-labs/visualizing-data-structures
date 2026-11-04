import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.NoSuchElementException;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        DoublyLinkedList<String> list = new DoublyLinkedList<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            try {
                String result = switch (p[0]) {
                    case "insertHead" -> {
                        list.insertHead(p[1]);
                        yield "ok";
                    }
                    case "insertTail" -> {
                        list.insertTail(p[1]);
                        yield "ok";
                    }
                    case "insertAt" -> {
                        list.insertAt(Integer.parseInt(p[1]), p[2]);
                        yield "ok";
                    }
                    case "removeHead" -> list.removeHead();
                    case "removeTail" -> list.removeTail();
                    case "removeAt" -> list.removeAt(Integer.parseInt(p[1]));
                    case "removeValue" -> String.valueOf(list.removeValue(p[1]));
                    case "search" -> String.valueOf(list.search(p[1]));
                    case "get" -> list.get(Integer.parseInt(p[1]));
                    case "reverse" -> {
                        list.reverse();
                        yield "ok";
                    }
                    case "print" -> list.toString().isEmpty() ? "empty" : list.toString();
                    default -> throw new IllegalArgumentException("unknown operation " + p[0]);
                };
                out.append(result).append('\n');
            } catch (NoSuchElementException e) {
                out.append("empty\n");
            } catch (IndexOutOfBoundsException e) {
                out.append("index error\n");
            }
        }
        System.out.print(out);
    }
}

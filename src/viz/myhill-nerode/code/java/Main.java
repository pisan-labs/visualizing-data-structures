import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Test driver: reads one operation per line, prints one result per line. A complete DFA comes
 * as dfa, alphabet, start, accept and move lines (none print); "classes" prints "eps a ab |
 * eps-a->a ..." or "more than 8 classes"; "apart w1 w2 ..." prints the suffix for each pair
 * (w2,w1) (w3,w1) (w3,w2) ..., or - for equivalent words.
 */
public class Main {
    static String name(String w) { return w.isEmpty() ? "eps" : w; }

    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> alphabet = new ArrayList<>();
        String start = null;
        Set<String> accept = new HashSet<>();
        Map<String, String> delta = new HashMap<>();
        String line;
        while ((line = in.readLine()) != null) {
            List<String> w = Arrays.asList(line.trim().split("\\s+"));
            List<String> rest = w.subList(1, w.size());
            switch (w.get(0)) {
                case "dfa" -> {
                    alphabet = new ArrayList<>();
                    accept = new HashSet<>();
                    delta = new HashMap<>();
                }
                case "alphabet" -> alphabet = new ArrayList<>(rest);
                case "start" -> start = rest.get(0);
                case "accept" -> accept = new HashSet<>(rest);
                case "move" -> delta.put(rest.get(0) + " " + rest.get(1), rest.get(2));
                case "classes" -> {
                    List<String> words = new ArrayList<>();
                    List<Nerode.Move> moves = new ArrayList<>();
                    if (!new Nerode(alphabet, start, accept, delta).classes(8, words, moves)) {
                        System.out.println("more than 8 classes");
                        break;
                    }
                    StringBuilder sb = new StringBuilder();
                    for (String x : words) sb.append(name(x)).append(' ');
                    sb.append('|');
                    for (Nerode.Move m : moves)
                        sb.append(' ').append(name(words.get(m.from()))).append('-').append(m.on())
                            .append("->").append(name(words.get(m.to())));
                    System.out.println(sb);
                }
                case "apart" -> {
                    Nerode n = new Nerode(alphabet, start, accept, delta);
                    List<String> words = new ArrayList<>();
                    for (String x : rest) words.add(x.equals("eps") ? "" : x);
                    List<String> out = new ArrayList<>();
                    for (int i = 1; i < words.size(); i++)
                        for (int j = 0; j < i; j++) {
                            String z = n.apart(words.get(i), words.get(j));
                            out.add(z == null ? "-" : name(z));
                        }
                    System.out.println(String.join(" ", out));
                }
                default -> { }
            }
        }
    }
}

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * Test driver: reads one operation per line, prints one result per line. "dfa start accept,...
 * state,... from:symbol:to ..." sets the DFA, "vocab token ..." the tokens and "logits prev
 * logit ..." the model's row after a token (none print). "index" prints each state's allowed
 * tokens. "next prev state greedy|sample mask(1|0) u" prints the token chosen and the state it
 * leads to ("dead" if it leaves the DFA).
 */
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        Constrained.Dfa dfa = null;
        List<String> vocab = new ArrayList<>();
        Map<String, double[]> rows = new HashMap<>();
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] a = line.trim().split("\\s+");
            if (a[0].isEmpty()) continue;
            switch (a[0]) {
                case "dfa" -> {
                    Map<String, String> delta = new HashMap<>();
                    for (int i = 4; i < a.length; i++) {
                        String[] m = a[i].split(":");
                        delta.put(m[0] + ":" + m[1], m[2]);
                    }
                    dfa = new Constrained.Dfa(a[1], new HashSet<>(Arrays.asList(a[2].split(","))),
                            Arrays.asList(a[3].split(",")), delta);
                }
                case "vocab" -> vocab = Arrays.asList(Arrays.copyOfRange(a, 1, a.length));
                case "logits" -> {
                    double[] r = new double[a.length - 2];
                    for (int i = 2; i < a.length; i++) r[i - 2] = Double.parseDouble(a[i]);
                    rows.put(a[1], r);
                }
                case "index" -> {
                    var index = Constrained.buildIndex(dfa, vocab);
                    StringJoiner all = new StringJoiner(" | ");
                    for (String q : dfa.states()) {
                        StringBuilder s = new StringBuilder(q + ":");
                        for (var e : index.get(q).entrySet())
                            s.append(' ').append(e.getKey().equals(Constrained.END)
                                    ? e.getKey() : e.getKey() + ">" + e.getValue());
                        all.add(s);
                    }
                    out.append(all).append('\n');
                }
                case "next" -> {
                    String state = a[2];
                    boolean dead = state.equals("dead");
                    Map<String, String> allowed = a[4].equals("1") && !dead
                            ? Constrained.buildIndex(dfa, vocab).get(state) : null;
                    String t = Constrained.nextToken(vocab, rows.get(a[1]), allowed,
                            a[3].equals("greedy"), Double.parseDouble(a[5]));
                    String to = t.equals(Constrained.END) ? state
                            : dead ? null : Constrained.walk(dfa, state, t);
                    out.append(t).append(' ').append(to == null ? "dead" : to).append('\n');
                }
                default -> throw new IllegalArgumentException("unknown operation " + a[0]);
            }
        }
        System.out.print(out);
    }
}

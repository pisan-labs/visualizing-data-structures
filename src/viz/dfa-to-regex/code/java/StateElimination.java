import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Sipser's state elimination: from a DFA to a regular expression. */
public class StateElimination {
  /** A label and its kind, so we know where parentheses go. */
  record Label(String text, String kind) {}

  static final Label EMPTY = new Label("∅", "empty");
  static final Label EPS = new Label("ε", "eps");

  // The constructors simplify with R∅ = ∅, Rε = R, R ∪ ∅ = R, ε* = ε and ∅* = ε.
  static Label union(Label x, Label y) {
    if (x.kind().equals("empty")) return y;
    if (y.kind().equals("empty")) return x;
    return new Label(x.text() + "∪" + y.text(), "union");
  }

  static Label concat(Label x, Label y) {
    if (x.kind().equals("empty") || y.kind().equals("empty")) return EMPTY;
    if (x.kind().equals("eps")) return y;
    if (y.kind().equals("eps")) return x;
    return new Label(part(x) + part(y), "concat");
  }

  static String part(Label r) {
    return r.kind().equals("union") ? "(" + r.text() + ")" : r.text();
  }

  static Label star(Label x) {
    if (x.kind().equals("empty") || x.kind().equals("eps")) return EPS;
    String inner = x.kind().equals("sym") ? x.text() : "(" + x.text() + ")";
    return new Label(inner + "*", "star");
  }

  /** states: the DFA's states in the order to rip them; moves: {from, symbol, to}. */
  static String toRegex(
      List<String> states, String start, List<String> accept, List<String[]> moves) {
    String s = "<s>", f = "<f>"; // the new start and accept; no DFA state has these names
    Map<List<String>, Label> label = new LinkedHashMap<>(); // a missing pair means ∅
    label.merge(List.of(s, start), EPS, StateElimination::union);
    for (String[] m : moves) // parallel moves unite: a∪b
      label.merge(List.of(m[0], m[2]), new Label(m[1], "sym"), StateElimination::union);
    for (String q : accept) label.merge(List.of(q, f), EPS, StateElimination::union);
    for (String rip : states) {
      Label loop = star(label.getOrDefault(List.of(rip, rip), EMPTY));
      List<String> ins = new ArrayList<>();
      List<String> outs = new ArrayList<>();
      for (List<String> k : label.keySet()) {
        if (k.get(1).equals(rip) && !k.get(0).equals(rip)) ins.add(k.get(0));
        if (k.get(0).equals(rip) && !k.get(1).equals(rip)) outs.add(k.get(1));
      }
      for (String p : ins)
        for (String q : outs) {
          Label path =
              concat(concat(label.get(List.of(p, rip)), loop), label.get(List.of(rip, q)));
          // R1(R2)*R3 ∪ R4
          label.put(List.of(p, q), union(path, label.getOrDefault(List.of(p, q), EMPTY)));
        }
      label.keySet().removeIf(k -> k.contains(rip));
    }
    return label.getOrDefault(List.of(s, f), EMPTY).text();
  }
}

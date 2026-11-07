import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * A Moore machine writes on its states: out.get(q). delta.get(q).get(c) is where state q goes on
 * symbol c, and every state has a move on every symbol.
 */
class Moore {
  final List<String> states;
  final String start;
  final Map<String, Map<Character, String>> delta;
  final Map<String, String> out;

  Moore(List<String> states, String start, Map<String, Map<Character, String>> delta,
      Map<String, String> out) {
    this.states = states;
    this.start = start;
    this.delta = delta;
    this.out = out;
  }

  String run(String word) {
    String q = start;
    StringBuilder written = new StringBuilder(out.get(q)); // before reading anything
    for (char c : word.toCharArray()) {
      q = delta.get(q).get(c);
      written.append(out.get(q));
    }
    return written.toString();
  }

  /** Each move writes what the state it enters writes. The states stay. */
  Mealy toMealy() {
    Map<String, Map<Character, String>> writes = new HashMap<>();
    delta.forEach((q, row) -> {
      Map<Character, String> w = new HashMap<>();
      row.forEach((c, r) -> w.put(c, out.get(r)));
      writes.put(q, w);
    });
    return new Mealy(states, start, delta, writes);
  }
}

/** A Mealy machine writes on its moves: out.get(q).get(c) for the move from q on c. */
class Mealy {
  final List<String> states;
  final String start;
  final Map<String, Map<Character, String>> delta;
  final Map<String, Map<Character, String>> out;

  Mealy(List<String> states, String start, Map<String, Map<Character, String>> delta,
      Map<String, Map<Character, String>> out) {
    this.states = states;
    this.start = start;
    this.delta = delta;
    this.out = out;
  }

  String run(String word) {
    String q = start;
    StringBuilder written = new StringBuilder();
    for (char c : word.toCharArray()) {
      written.append(out.get(q).get(c));
      q = delta.get(q).get(c);
    }
    return written.toString();
  }

  /** Split each state by the outputs written on the moves into it. */
  Moore toMoore() {
    Map<String, TreeSet<String>> entered = new HashMap<>();
    for (String q : states) entered.put(q, new TreeSet<>());
    String first = null;
    for (String q : states) {
      for (var move : delta.get(q).entrySet()) {
        String o = out.get(q).get(move.getKey());
        entered.get(move.getValue()).add(o);
        if (first == null || o.compareTo(first) < 0) first = o;
      }
    }
    Map<String, String> copy = new HashMap<>(); // "q o" -> the copy of q that writes o
    Map<String, String> copyOf = new LinkedHashMap<>(); // copy -> q
    Map<String, String> writes = new HashMap<>();
    for (String q : states) {
      List<String> outs = new ArrayList<>(entered.get(q));
      if (outs.isEmpty()) outs.add(first);
      for (int i = 0; i < outs.size(); i++) {
        String p = q + "'".repeat(i);
        copy.put(q + " " + outs.get(i), p);
        copyOf.put(p, q);
        writes.put(p, outs.get(i));
      }
    }
    Map<String, Map<Character, String>> moves = new HashMap<>();
    copyOf.forEach((p, q) -> {
      Map<Character, String> row = new HashMap<>();
      delta.get(q).forEach((c, r) -> row.put(c, copy.get(r + " " + out.get(q).get(c))));
      moves.put(p, row);
    });
    return new Moore(new ArrayList<>(copyOf.keySet()), start, moves, writes); // q0 is its own first copy
  }
}

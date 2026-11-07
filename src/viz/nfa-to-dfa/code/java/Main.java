import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  static String letter(int i) {
    return (char) ('A' + i % 26) + (i >= 26 ? String.valueOf(i / 26) : "");
  }

  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    List<String> alphabet = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<int[]> moves = new ArrayList<>();
    int start = 0;
    int accept = 0;
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "nfa" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          alphabet = new ArrayList<>();
          moves = new ArrayList<>();
          accept = 0;
        }
        case "alphabet" -> alphabet = List.of(p).subList(1, p.length);
        case "start" -> start = index.get(p[1]);
        case "accept" -> {
          for (int i = 1; i < p.length; i++) accept |= 1 << index.get(p[i]);
        }
        case "move" -> moves.add(
            new int[] {index.get(p[1]), p[2].equals("eps") ? -1 : alphabet.indexOf(p[2]),
              index.get(p[3])});
        case "convert" -> {
          int n = names.size(), k = alphabet.size();
          List<List<List<Integer>>> by = new ArrayList<>();
          List<List<Integer>> epsBy = new ArrayList<>();
          for (int q = 0; q < n; q++) {
            by.add(new ArrayList<>());
            for (int c = 0; c < k; c++) by.get(q).add(new ArrayList<>());
            epsBy.add(new ArrayList<>());
          }
          for (int[] m : moves) (m[1] < 0 ? epsBy.get(m[0]) : by.get(m[0]).get(m[1])).add(m[2]);
          int[][][] delta = new int[n][k][];
          int[][] eps = new int[n][];
          for (int q = 0; q < n; q++) {
            for (int c = 0; c < k; c++)
              delta[q][c] = by.get(q).get(c).stream().mapToInt(Integer::intValue).toArray();
            eps[q] = epsBy.get(q).stream().mapToInt(Integer::intValue).toArray();
          }
          Subsets d = new Subsets(delta, eps, k, start, accept);
          StringJoiner states = new StringJoiner(" ");
          StringJoiner acc = new StringJoiner(" ");
          StringJoiner arrows = new StringJoiner(" ");
          for (int i = 0; i < d.sets.size(); i++) {
            StringJoiner set = new StringJoiner(",", "{", "}");
            for (int q = 0; q < n; q++) if ((d.sets.get(i) >> q & 1) == 1) set.add(names.get(q));
            states.add(letter(i) + "=" + set);
            if (d.accepts.get(i)) acc.add(letter(i));
            for (int c = 0; c < k; c++)
              arrows.add(letter(i) + "-" + alphabet.get(c) + "->" + letter(d.delta.get(i)[c]));
          }
          out.append(states).append(" | accept ").append(acc.length() > 0 ? acc : "-")
              .append(" | ").append(arrows.length() > 0 ? arrows : "-").append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}

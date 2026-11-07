import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    List<String> names = new ArrayList<>();
    List<String> alphabet = new ArrayList<>();
    Map<String, Integer> index = new HashMap<>();
    List<String[]> moves = new ArrayList<>();
    String start = "";
    List<String> accept = new ArrayList<>();
    StringBuilder out = new StringBuilder();
    String line;
    while ((line = in.readLine()) != null) {
      String[] p = line.trim().split("\\s+");
      switch (p[0]) {
        case "dfa" -> {
          names = List.of(p).subList(1, p.length);
          index = new HashMap<>();
          for (int i = 0; i < names.size(); i++) index.put(names.get(i), i);
          alphabet = new ArrayList<>();
          moves = new ArrayList<>();
          accept = new ArrayList<>();
        }
        case "alphabet" -> alphabet = List.of(p).subList(1, p.length);
        case "start" -> start = p[1];
        case "accept" -> accept = List.of(p).subList(1, p.length);
        case "move" -> moves.add(p);
        case "minimize" -> {
          int n = names.size(), k = alphabet.size();
          int[][] delta = new int[n][k];
          for (int[] row : delta) Arrays.fill(row, -1);
          for (String[] m : moves) delta[index.get(m[1])][alphabet.indexOf(m[2])] = index.get(m[3]);
          boolean[] acc = new boolean[n];
          for (String q : accept) acc[index.get(q)] = true;
          Minimize r = new Minimize(delta, k, index.get(start), acc);
          String dead = "dead";
          for (int i = 2; index.containsKey(dead); i++) dead = "dead" + i;
          StringJoiner blocks = new StringJoiner(" ");
          StringJoiner accepting = new StringJoiner(" ");
          StringJoiner arrows = new StringJoiner(" ");
          int startBlock = 0;
          for (int b = 0; b < r.blocks.size(); b++) {
            StringJoiner set = new StringJoiner(",", (b + 1) + "={", "}");
            for (int q : r.blocks.get(b)) {
              set.add(q < n ? names.get(q) : dead);
              if (q == index.get(start)) startBlock = b + 1;
            }
            blocks.add(set.toString());
            int first = r.blocks.get(b).get(0);
            if (first < n && acc[first]) accepting.add(String.valueOf(b + 1));
            for (int c = 0; c < k; c++)
              arrows.add((b + 1) + "-" + alphabet.get(c) + "->" + (r.moves.get(b)[c] + 1));
          }
          out.append(blocks).append(" | start ").append(startBlock).append(" | accept ")
              .append(accepting.length() > 0 ? accepting : "-").append(" | ")
              .append(arrows.length() > 0 ? arrows : "-").append('\n');
        }
        default -> { }
      }
    }
    System.out.print(out);
  }
}

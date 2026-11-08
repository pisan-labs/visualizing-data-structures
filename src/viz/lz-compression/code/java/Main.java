import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/** Test driver: lz77 W A text, unlz77 triples..., lzw text, unlzw codes..., one per line. */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "lz77" -> {
                    List<Lz.Triple> ts =
                            Lz.lz77(p[3], Integer.parseInt(p[1]), Integer.parseInt(p[2]));
                    out.append(ts.stream()
                                    .map(t -> "(" + t.offset() + "," + t.length() + "," + t.next() + ")")
                                    .collect(Collectors.joining(" ")))
                            .append('\n');
                }
                case "unlz77" -> {
                    List<Lz.Triple> ts = new ArrayList<>();
                    for (int i = 1; i < p.length; i++) {
                        String[] f = p[i].substring(1, p[i].length() - 1).split(",");
                        ts.add(new Lz.Triple(
                                Integer.parseInt(f[0]), Integer.parseInt(f[1]), f[2].charAt(0)));
                    }
                    out.append(Lz.unlz77(ts)).append('\n');
                }
                case "lzw" -> out.append(Lz.lzw(p[1]).stream()
                                .map(String::valueOf)
                                .collect(Collectors.joining(" ")))
                        .append('\n');
                case "unlzw" -> {
                    List<Integer> codes = new ArrayList<>();
                    for (int i = 1; i < p.length; i++) {
                        codes.add(Integer.parseInt(p[i]));
                    }
                    out.append(Lz.unlzw(codes)).append('\n');
                }
                default -> {}
            }
        }
        System.out.print(out);
    }
}

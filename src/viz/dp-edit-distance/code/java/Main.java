import java.io.BufferedReader;
import java.io.InputStreamReader;

/**
 * Test driver: "dist a b ins del sub" prints the edit distance; "align a b ins del sub" prints
 * the distance and the edits (M match, S substitute, D delete, I insert) from left to right.
 */
public class Main {
    public static void main(String[] argv) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p.length != 6) {
                continue;
            }
            int ins = Integer.parseInt(p[3]);
            int del = Integer.parseInt(p[4]);
            int sub = Integer.parseInt(p[5]);
            int dist = EditDistance.distance(p[1], p[2], ins, del, sub);
            switch (p[0]) {
                case "dist" -> out.append(dist).append('\n');
                case "align" -> out.append(dist)
                        .append(' ')
                        .append(EditDistance.alignment(p[1], p[2], ins, del, sub))
                        .append('\n');
                default -> { }
            }
        }
        System.out.print(out);
    }
}

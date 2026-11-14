import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * Test driver: "load r c v1 v2 ..." replaces the matrix (r rows, c columns, row by row);
 * "spiral" prints the values in spiral order; "rotate" turns it clockwise in place and prints
 * its rows, separated by " / ".
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[][] m = new int[0][0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> {
                    int rows = Integer.parseInt(p[1]), cols = Integer.parseInt(p[2]);
                    m = new int[rows][cols];
                    for (int k = 0; k < rows * cols; k++) m[k / cols][k % cols] = Integer.parseInt(p[3 + k]);
                }
                case "spiral" -> {
                    List<String> out = new ArrayList<>();
                    for (int v : Matrix.spiralOrder(m)) out.add(String.valueOf(v));
                    System.out.println(String.join(" ", out));
                }
                case "rotate" -> {
                    Matrix.rotate(m);
                    List<String> rows = new ArrayList<>();
                    for (int[] row : m) {
                        List<String> vs = new ArrayList<>();
                        for (int v : row) vs.add(String.valueOf(v));
                        rows.add(String.join(" ", vs));
                    }
                    System.out.println(String.join(" / ", rows));
                }
                default -> {}
            }
        }
    }
}

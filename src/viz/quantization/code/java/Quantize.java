import java.util.ArrayList;
import java.util.List;

/** Absmax and zero-point quantization of a matrix, with one scale per group of weights. */
public class Quantize {
    /** The nearest whole number; halves go away from zero. */
    static int roundHalfAway(double x) {
        return (int) (Math.signum(x) * Math.floor(Math.abs(x) + 0.5));
    }

    /** The scaling constant s and the zero point z for one group of weights. */
    record Scale(double s, int z) {}

    static Scale scaleFor(double[] values, int bits, String scheme) {
        if (scheme.equals("absmax")) {
            int qmax = (1 << (bits - 1)) - 1; // 127 for int8, 7 for int4
            double m = 0;
            for (double v : values) m = Math.max(m, Math.abs(v));
            return new Scale(m > 0 ? qmax / m : 1.0, 0);
        }
        int qmax = (1 << bits) - 1; // 255 for int8, 15 for int4
        double lo = 0, hi = 0; // 0 stays in the range
        for (double v : values) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
        }
        double s = hi > lo ? qmax / (hi - lo) : 1.0;
        return new Scale(s, roundHalfAway(-lo * s));
    }

    static int quantize(double w, Scale g, int bits, String scheme) {
        int q = roundHalfAway(g.s() * w);
        if (scheme.equals("absmax")) return q;
        return Math.max(0, Math.min((1 << bits) - 1, q + g.z()));
    }

    static double dequantize(int q, Scale g) {
        return (q - g.z()) / g.s();
    }

    /** The cells of each group: the whole matrix, each row, or blocks along a row. */
    static List<int[][]> groups(int rows, int cols, String group) {
        List<int[][]> out = new ArrayList<>();
        if (group.equals("tensor")) {
            int[][] cells = new int[rows * cols][];
            for (int i = 0; i < rows * cols; i++) cells[i] = new int[] {i / cols, i % cols};
            out.add(cells);
            return out;
        }
        int size = group.equals("row") ? cols : Integer.parseInt(group);
        for (int r = 0; r < rows; r++)
            for (int b = 0; b < cols; b += size) {
                int[][] cells = new int[size][];
                for (int i = 0; i < size; i++) cells[i] = new int[] {r, b + i};
                out.add(cells);
            }
        return out;
    }

    /** Codes and decoded weights for a matrix, one scale per group. */
    static void quantizeMatrix(double[][] w, int bits, String scheme, String group,
            int[][] codes, double[][] decoded) {
        for (int[][] cells : groups(w.length, w[0].length, group)) {
            double[] values = new double[cells.length];
            for (int i = 0; i < cells.length; i++) values[i] = w[cells[i][0]][cells[i][1]];
            Scale g = scaleFor(values, bits, scheme);
            for (int[] rc : cells) {
                codes[rc[0]][rc[1]] = quantize(w[rc[0]][rc[1]], g, bits, scheme);
                decoded[rc[0]][rc[1]] = dequantize(codes[rc[0]][rc[1]], g);
            }
        }
    }
}

import java.util.ArrayList;
import java.util.List;

public class Matrix {
    /**
     * The values of a matrix in spiral order: clockwise from the top left, ring by ring. Four
     * bounds mark the part not visited yet; O(1) extra space besides the answer.
     */
    public static List<Integer> spiralOrder(int[][] m) {
        List<Integer> out = new ArrayList<>();
        int top = 0, bottom = m.length - 1, left = 0, right = m[0].length - 1;
        while (top <= bottom && left <= right) {
            for (int c = left; c <= right; c++) out.add(m[top][c]);
            top++;
            for (int r = top; r <= bottom; r++) out.add(m[r][right]);
            right--;
            if (top <= bottom) { // a row is left for the bottom side
                for (int c = right; c >= left; c--) out.add(m[bottom][c]);
                bottom--;
            }
            if (left <= right) { // a column is left for the left side
                for (int r = bottom; r >= top; r--) out.add(m[r][left]);
                left++;
            }
        }
        return out;
    }

    /** Turns a square matrix a quarter turn clockwise, in place, one ring at a time. */
    public static void rotate(int[][] m) {
        int n = m.length;
        for (int layer = 0; layer < n / 2; layer++) {
            int first = layer, last = n - 1 - layer;
            for (int k = 0; k < last - first; k++) {
                int tmp = m[first][first + k];
                m[first][first + k] = m[last - k][first]; // left to top
                m[last - k][first] = m[last][last - k]; // bottom to left
                m[last][last - k] = m[first + k][last]; // right to bottom
                m[first + k][last] = tmp; // top to right
            }
        }
    }
}

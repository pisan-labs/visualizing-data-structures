import java.util.ArrayList;
import java.util.List;

/** N-Queens by backtracking: one queen per row, taken back at dead ends. */
public class Queens {
    private final int n;
    private final boolean firstOnly;
    private final int[] queens; // queens[r] is the column of the queen in row r
    private final List<int[]> solutions = new ArrayList<>();

    private Queens(int n, boolean firstOnly) {
        this.n = n;
        this.firstOnly = firstOnly;
        this.queens = new int[n];
    }

    /** The solutions found, as arrays of columns: the first one, or all of them. */
    public static List<int[]> solve(int n, boolean firstOnly) {
        Queens q = new Queens(n, firstOnly);
        q.place(0);
        return q.solutions;
    }

    private boolean safe(int row, int col) {
        for (int r = 0; r < row; r++) {
            if (queens[r] == col || Math.abs(queens[r] - col) == row - r) {
                return false;
            }
        }
        return true;
    }

    private boolean place(int row) {
        if (row == n) {
            solutions.add(queens.clone());
            return firstOnly;
        }
        for (int col = 0; col < n; col++) {
            if (safe(row, col)) {
                queens[row] = col;
                if (place(row + 1)) {
                    return true;
                }
                // Backtrack: the next column overwrites queens[row].
            }
        }
        return false;
    }
}

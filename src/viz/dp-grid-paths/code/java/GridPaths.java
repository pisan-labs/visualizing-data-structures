public final class GridPaths {
    private GridPaths() {}

    static final char WALL = '#';
    static final int INF = Integer.MAX_VALUE / 2; // no way in; adding a cost stays below overflow

    /** Paths from the top left to the bottom right, moving right or down. '#' is a wall. */
    public static long countPaths(String[] grid) {
        int rows = grid.length, cols = grid[0].length();
        long[][] p = new long[rows][cols];
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) {
                if (grid[r].charAt(c) == WALL) continue; // no path goes through a wall
                if (r == 0 && c == 0) p[r][c] = 1;
                else p[r][c] = (r > 0 ? p[r - 1][c] : 0) + (c > 0 ? p[r][c - 1] : 0);
            }
        return p[rows - 1][cols - 1];
    }

    /** The cheapest path's cost and its moves (D down, R right). */
    public record Path(int cost, String moves) {}

    /** The cheapest path, paying each cell's digit; null if walls block every path. */
    public static Path cheapestPath(String[] grid) {
        int rows = grid.length, cols = grid[0].length();
        int[][] m = new int[rows][cols];
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) {
                m[r][c] = INF;
                if (grid[r].charAt(c) == WALL) continue; // no way in
                int cost = grid[r].charAt(c) - '0';
                if (r == 0 && c == 0) m[r][c] = cost;
                else {
                    int up = r > 0 ? m[r - 1][c] : INF;
                    int left = c > 0 ? m[r][c - 1] : INF;
                    int best = Math.min(up, left);
                    if (best < INF) m[r][c] = cost + best; // this cell, plus the cheaper way in
                }
            }
        if (m[rows - 1][cols - 1] >= INF) return null;
        StringBuilder back = new StringBuilder();
        int r = rows - 1, c = cols - 1;
        while (r > 0 || c > 0) { // walk back to the cheaper neighbour; a tie goes up
            if (r > 0 && (c == 0 || m[r - 1][c] <= m[r][c - 1])) {
                r--;
                back.append('D');
            } else {
                c--;
                back.append('R');
            }
        }
        return new Path(m[rows - 1][cols - 1], back.reverse().toString());
    }
}

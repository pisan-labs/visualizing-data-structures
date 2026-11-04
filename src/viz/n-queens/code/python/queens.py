def solve(n, first_only=True):
    """Place n queens on an n x n board, one per row, backtracking at dead ends.
    Returns the solutions found, as lists of columns: the first one, or all of them."""
    queens = []  # queens[r] is the column of the queen in row r
    solutions = []

    def safe(row, col):
        return all(c != col and abs(c - col) != row - r for r, c in enumerate(queens))

    def place(row):
        if row == n:
            solutions.append(list(queens))
            return first_only
        for col in range(n):
            if safe(row, col):
                queens.append(col)
                if place(row + 1):
                    return True
                queens.pop()
        return False

    place(0)
    return solutions

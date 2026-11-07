import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * The pumping lemma game: membership tests, legal splits, pumping, and both players' searches.
 * A split is the lengths of its pieces: {x, y, z} (regular) or {u, v, x, y, z} (context-free).
 */
public class Pumping {
    public static final int MAX_I = 5; // the largest i either player uses

    static long count(String w, char c) {
        return w.chars().filter(x -> x == c).count();
    }

    static boolean isPrime(int n) {
        if (n < 2) return false;
        for (int d = 2; d * d <= n; d++) if (n % d == 0) return false;
        return true;
    }

    static boolean balanced(String w) {
        int depth = 0;
        for (char c : w.toCharArray()) {
            depth += c == '(' ? 1 : -1;
            if (depth < 0) return false;
        }
        return depth == 0;
    }

    static boolean halvesEqual(String w) {
        int h = w.length() / 2;
        return w.length() % 2 == 0 && w.substring(0, h).equals(w.substring(h));
    }

    static boolean isSquare(int n) {
        int r = (int) Math.round(Math.sqrt(n));
        return r * r == n;
    }

    public static Predicate<String> member(String lang) {
        return switch (lang) {
            case "anbn" -> w -> w.matches("a*b*") && count(w, 'a') == count(w, 'b');
            case "paren" -> Pumping::balanced;
            case "wwr" -> w -> w.length() % 2 == 0
                    && w.equals(new StringBuilder(w).reverse().toString());
            case "ww" -> Pumping::halvesEqual;
            case "anbncn" -> w -> w.matches("a*b*c*")
                    && count(w, 'a') == count(w, 'b') && count(w, 'b') == count(w, 'c');
            case "squares" -> w -> w.matches("a*") && isSquare(w.length());
            case "primes" -> w -> w.matches("a*") && isPrime(w.length());
            case "abstar" -> w -> w.matches("(ab)*");
            case "astarbstar" -> w -> w.matches("a*b*");
            default -> throw new IllegalArgumentException(lang);
        };
    }

    /** Every legal split of a string of length n, x (or u) first. */
    public static List<int[]> splits(int n, int p, boolean regular) {
        List<int[]> out = new ArrayList<>();
        if (regular) { // |xy| <= p, |y| >= 1
            for (int x = 0; x < p && x < n; x++)
                for (int y = 1; x + y <= p && x + y <= n; y++) out.add(new int[] {x, y, n - x - y});
            return out;
        }
        for (int u = 0; u < n; u++) // |vxy| <= p, |vy| >= 1
            for (int v = 0; v <= p; v++)
                for (int x = 0; v + x <= p; x++)
                    for (int y = 0; v + x + y <= p; y++)
                        if (v + y > 0 && u + v + x + y <= n)
                            out.add(new int[] {u, v, x, y, n - u - v - x - y});
        return out;
    }

    public static String pump(String s, int[] parts, int i, boolean regular) {
        StringBuilder out = new StringBuilder();
        int at = 0;
        for (int k = 0; k < parts.length; k++) {
            String piece = s.substring(at, at + parts[k]);
            boolean pumped = k == 1 || (!regular && k == 3);
            out.append(pumped ? piece.repeat(i) : piece);
            at += parts[k];
        }
        return out.toString();
    }

    /** The adversary's search: how many splits, how many survive every i, and its pick. */
    public record Search(int count, int survivors, int[] pick) {}

    public static Search adversary(String lang, String s, int p, boolean regular) {
        Predicate<String> member = member(lang);
        int[] best = null;
        int bestScore = -1, survivors = 0;
        List<int[]> all = splits(s.length(), p, regular);
        for (int[] parts : all) {
            int score = 0;
            for (int i = 0; i <= MAX_I; i++) if (member.test(pump(s, parts, i, regular))) score++;
            if (score == MAX_I + 1) survivors++;
            if (score > bestScore) {
                best = parts;
                bestScore = score;
            }
        }
        return new Search(all.size(), survivors, best);
    }

    /** The first i that pumps s out of L, or -1 if the split survives them all. */
    public static int prover(String lang, String s, int[] parts, boolean regular) {
        for (int i : new int[] {0, 2, 3, 4, 5})
            if (!member(lang).test(pump(s, parts, i, regular))) return i;
        return -1;
    }
}

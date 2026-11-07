import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Thompson's construction: a regular expression to an NFA, then a run on a word.
 * Expressions use letters and digits, ε (or eps), ∅, | (union), * (zero or more),
 * + (one or more), ? (optional) and parentheses.
 */
public class ThompsonNfa {
    public static final char EPS = 'ε';

    private record Move(char symbol, int to) {}

    /** A piece of the NFA under construction: its start and accept states. */
    private record Piece(int start, int accept) {}

    private final List<List<Move>> moves = new ArrayList<>();
    private final String text;
    private int pos = 0;
    private final Piece whole;

    /** Throws IllegalArgumentException if the expression is not well formed. */
    public ThompsonNfa(String regex) {
        text = regex.replaceAll("\\beps\\b", "ε").replaceAll("\\s+", ""); // eps on its own is ε
        whole = union();
        if (pos < text.length()) throw new IllegalArgumentException("unexpected " + peek());
    }

    public int states() {
        return moves.size();
    }

    public int moveCount() {
        return moves.stream().mapToInt(List::size).sum();
    }

    public boolean accepts(String word) {
        Set<Integer> current = closure(Set.of(whole.start()));
        for (char c : word.toCharArray()) {
            Set<Integer> next = new HashSet<>();
            for (int p : current)
                for (Move m : moves.get(p)) if (m.symbol() == c) next.add(m.to());
            current = closure(next);
            if (current.isEmpty()) return false;
        }
        return current.contains(whole.accept());
    }

    /** Every state reachable from the given ones by ε-moves alone. */
    private Set<Integer> closure(Set<Integer> states) {
        Set<Integer> seen = new HashSet<>(states);
        ArrayDeque<Integer> todo = new ArrayDeque<>(states);
        while (!todo.isEmpty())
            for (Move m : moves.get(todo.pop()))
                if (m.symbol() == EPS && seen.add(m.to())) todo.push(m.to());
        return seen;
    }

    private int newState() {
        moves.add(new ArrayList<>());
        return moves.size() - 1;
    }

    private void add(int p, char symbol, int q) {
        moves.get(p).add(new Move(symbol, q));
    }

    private char peek() {
        return pos < text.length() ? text.charAt(pos) : '\0';
    }

    /** A symbol, ε or ∅: two states, joined unless it is ∅. */
    private Piece piece(char symbol) {
        Piece p = new Piece(newState(), newState());
        if (symbol != '∅') add(p.start(), symbol, p.accept());
        return p;
    }

    /** Union: a new start and accept around both pieces. */
    private Piece either(Piece a, Piece b) {
        Piece p = new Piece(newState(), newState());
        add(p.start(), EPS, a.start());
        add(p.start(), EPS, b.start());
        add(a.accept(), EPS, p.accept());
        add(b.accept(), EPS, p.accept());
        return p;
    }

    private Piece union() {
        Piece p = concat();
        while (peek() == '|') {
            pos++;
            p = either(p, concat());
        }
        return p;
    }

    private Piece concat() {
        Piece p = null;
        while (pos < text.length() && peek() != '|' && peek() != ')') {
            Piece next = postfix();
            if (p == null) p = next;
            else {
                add(p.accept(), EPS, next.start());
                p = new Piece(p.start(), next.accept());
            }
        }
        if (p == null) throw new IllegalArgumentException("something is missing");
        return p;
    }

    private Piece postfix() {
        Piece p = atom();
        while (peek() == '*' || peek() == '+' || peek() == '?') {
            char op = text.charAt(pos++);
            Piece loop = new Piece(newState(), newState());
            add(loop.start(), EPS, p.start());
            if (op != '?') add(p.accept(), EPS, p.start()); // repeat
            add(p.accept(), EPS, loop.accept());
            if (op != '+') add(loop.start(), EPS, loop.accept()); // skip
            p = loop;
        }
        return p;
    }

    private Piece atom() {
        char c = peek();
        if (c == '(') {
            pos++;
            Piece p = union();
            if (peek() != ')') throw new IllegalArgumentException("a ( is never closed");
            pos++;
            return p;
        }
        boolean symbol = c < 128 && Character.isLetterOrDigit(c);
        if (c == EPS || c == '∅' || symbol) {
            pos++;
            return piece(c);
        }
        throw new IllegalArgumentException("unexpected " + c);
    }
}

import java.util.List;

/**
 * The Chomsky level of a grammar, from the form of its rules. A rule is a pair of strings, left
 * and right: capitals are variables, every other character is a terminal, and "" is the empty
 * string. The levels are tried from the most restrictive out, and the first one whose form every
 * rule fits is the answer.
 */
public class Chomsky {
    public static final String[] LEVELS = {
        "regular", "context-free", "context-sensitive", "unrestricted"
    };

    public record Rule(String left, String right) {}

    /** The level, and the first rule that does not fit the level below it (null for regular). */
    public record Result(String level, Rule below) {}

    static boolean isVariable(char c) {
        return c >= 'A' && c <= 'Z';
    }

    static boolean fits(String level, Rule r, char start, boolean startOnRight) {
        String left = r.left();
        String right = r.right();
        boolean oneVariable = left.length() == 1 && isVariable(left.charAt(0));
        return switch (level) {
            // A -> wB or A -> w: terminals, then at most one variable, at the end.
            case "regular" -> {
                int variables = 0;
                for (char c : right.toCharArray()) if (isVariable(c)) variables++;
                yield oneVariable && (variables == 0
                        || (variables == 1 && isVariable(right.charAt(right.length() - 1))));
            }
            case "context-free" -> oneVariable;
            // Never shrinks, except S -> eps for a start variable on no right side.
            case "context-sensitive" -> right.length() >= left.length()
                    || (right.isEmpty() && left.equals(String.valueOf(start)) && !startOnRight);
            default -> true; // unrestricted: any rule with a variable on the left
        };
    }

    public static Result classify(List<Rule> rules, char start) {
        boolean startOnRight = false;
        for (Rule r : rules) if (r.right().indexOf(start) >= 0) startOnRight = true;
        Rule below = null;
        for (String level : LEVELS) {
            Rule misfit = null;
            for (Rule r : rules) {
                if (!fits(level, r, start, startOnRight)) {
                    misfit = r;
                    break;
                }
            }
            if (misfit == null) return new Result(level, below);
            below = misfit;
        }
        throw new IllegalStateException("every rule fits the unrestricted form");
    }
}

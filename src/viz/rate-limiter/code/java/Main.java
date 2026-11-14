import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/** Test driver: reads one operation per line, prints one result per line. */
public class Main {
    static RateLimiters.Limiter make(String kind, int limit, int window) {
        return switch (kind) {
            case "fixed" -> new RateLimiters.FixedWindow(limit, window);
            case "log" -> new RateLimiters.SlidingLog(limit, window);
            case "counter" -> new RateLimiters.SlidingWindowCounter(limit, window);
            default -> new RateLimiters.TokenBucket(limit, window);
        };
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder out = new StringBuilder();
        String kind = "counter";
        int limit = 3, window = 10;
        RateLimiters.Limiter limiter = null;
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            if (p[0].isEmpty()) continue;
            switch (p[0]) {
                case "new" -> {
                    kind = p[1];
                    limit = Integer.parseInt(p[2]);
                    window = Integer.parseInt(p[3]);
                    limiter = make(kind, limit, window);
                }
                case "req" -> out.append(limiter.allow(Integer.parseInt(p[1])) ? "pass" : "refuse")
                        .append('\n');
                case "clear" -> {
                    limiter = make(kind, limit, window);
                    out.append("ok\n");
                }
                default -> throw new IllegalArgumentException(p[0]);
            }
        }
        System.out.print(out);
    }
}

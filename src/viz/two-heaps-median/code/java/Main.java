import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

/**
 * Test driver: "add x" adds a value; "median" prints the median (a whole number when it is
 * one); "lower" prints the lower median; "clear" starts again.
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        RunningMedian rm = new RunningMedian();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "add" -> rm.add(Integer.parseInt(p[1]));
                case "median" -> {
                    double m = rm.median();
                    System.out.println(m == Math.floor(m) ? String.valueOf((long) m) : String.valueOf(m));
                }
                case "lower" -> System.out.println(rm.lowerMedian());
                case "clear" -> rm = new RunningMedian();
                default -> {}
            }
        }
    }
}

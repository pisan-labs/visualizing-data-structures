import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringJoiner;

/**
 * Test driver: "load v1 v2 ..." replaces the array; "next" prints each value's next greater
 * value (-1 for none); "prev" prints each previous smaller value; "histogram" prints the largest
 * rectangle.
 */
public class Main {
    static String join(int[] a) {
        StringJoiner j = new StringJoiner(" ");
        for (int v : a) j.add(String.valueOf(v));
        return j.toString();
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int[] a = new int[0];
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> {
                    a = new int[p.length - 1];
                    for (int i = 1; i < p.length; i++) a[i - 1] = Integer.parseInt(p[i]);
                }
                case "next" -> System.out.println(join(MonotonicStack.nextGreater(a)));
                case "prev" -> System.out.println(join(MonotonicStack.previousSmaller(a)));
                case "histogram" -> System.out.println(MonotonicStack.largestRectangle(a));
                default -> {}
            }
        }
    }
}

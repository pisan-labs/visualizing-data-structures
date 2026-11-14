import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Test driver: "load w1 w2 ..." replaces the words; "group" prints the groups, each as its words
 * joined by commas, groups separated by spaces; "unique w" prints firstUnique(w).
 */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<String> words = new ArrayList<>();
        String line;
        while ((line = in.readLine()) != null) {
            String[] p = line.trim().split("\\s+");
            switch (p[0]) {
                case "load" -> words = new ArrayList<>(Arrays.asList(p).subList(1, p.length));
                case "group" -> {
                    List<String> out = new ArrayList<>();
                    for (List<String> g : Frequency.groupAnagrams(words)) out.add(String.join(",", g));
                    System.out.println(String.join(" ", out));
                }
                case "unique" -> System.out.println(Frequency.firstUnique(p[1]));
                default -> {}
            }
        }
    }
}

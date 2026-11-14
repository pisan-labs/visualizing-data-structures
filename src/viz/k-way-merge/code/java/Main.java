import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;

/** Test driver: "merge 1 8 12 | 3 4 10 | 2 9" prints the merged list. */
public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (!line.startsWith("merge")) continue;
            List<List<Integer>> lists = new ArrayList<>();
            for (String part : line.substring(5).split("\\|")) {
                List<Integer> list = new ArrayList<>();
                for (String t : part.trim().split("\\s+")) if (!t.isEmpty()) list.add(Integer.parseInt(t));
                lists.add(list);
            }
            StringJoiner out = new StringJoiner(" ");
            for (int x : KWayMerge.mergeLists(lists)) out.add(String.valueOf(x));
            System.out.println(out);
        }
    }
}

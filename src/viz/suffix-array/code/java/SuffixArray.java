import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** The suffix array of a text, its LCP array, pattern search and the longest repeat. */
public class SuffixArray {
  final String t;
  final Integer[] sa;
  final int[] lcp;

  public SuffixArray(String t) {
    this.t = t;
    sa = build(t);
    lcp = kasai(t, sa);
  }

  /** Start positions of the suffixes in sorted order, by prefix doubling. */
  static Integer[] build(String t) {
    int n = t.length();
    Integer[] sa = new Integer[n];
    int[] rank = new int[n];
    for (int i = 0; i < n; i++) {
      sa[i] = i;
      rank[i] = t.charAt(i);
    }
    for (int k = 1; ; k *= 2) {
      // Sort by the first 2k characters: a pair of ranks, -1 past the end.
      final int step = k;
      final int[] r = rank;
      Comparator<Integer> byPair =
          Comparator.<Integer>comparingInt(i -> r[i])
              .thenComparingInt(i -> i + step < n ? r[i + step] : -1);
      Arrays.sort(sa, byPair);
      int[] next = new int[n];
      for (int i = 1; i < n; i++)
        next[sa[i]] = next[sa[i - 1]] + (byPair.compare(sa[i - 1], sa[i]) < 0 ? 1 : 0);
      rank = next;
      if (rank[sa[n - 1]] == n - 1) return sa; // every rank differs: sorted
    }
  }

  /** Kasai: lcp[r] is the longest common prefix of rows r - 1 and r (lcp[0] = 0). */
  static int[] kasai(String t, Integer[] sa) {
    int n = t.length();
    int[] rank = new int[n];
    for (int r = 0; r < n; r++) rank[sa[r]] = r;
    int[] lcp = new int[n];
    int h = 0;
    for (int i = 0; i < n; i++) {
      if (rank[i] == 0) {
        h = 0;
        continue;
      }
      int j = sa[rank[i] - 1];
      while (i + h < n && j + h < n && t.charAt(i + h) == t.charAt(j + h)) h++;
      lcp[rank[i]] = h;
      if (h > 0) h--;
    }
    return lcp;
  }

  /** The first |p| characters of the suffix in row r, compared with p. */
  private int compare(int r, String p) {
    int start = sa[r];
    return t.substring(start, Math.min(t.length(), start + p.length())).compareTo(p);
  }

  /** Positions where p occurs, in increasing order: two binary searches. */
  public List<Integer> search(String p) {
    int lo = 0, hi = sa.length;
    while (lo < hi) { // the first row not smaller than p
      int mid = (lo + hi) / 2;
      if (compare(mid, p) < 0) lo = mid + 1;
      else hi = mid;
    }
    int first = lo;
    hi = sa.length;
    while (lo < hi) { // the first row past the ones that start with p
      int mid = (lo + hi) / 2;
      if (compare(mid, p) <= 0) lo = mid + 1;
      else hi = mid;
    }
    List<Integer> found = new ArrayList<>(Arrays.asList(sa).subList(first, lo));
    Collections.sort(found);
    return found;
  }

  /** The longest substring that occurs at least twice ("" if none). */
  public String longestRepeat() {
    int best = 0;
    for (int r = 1; r < lcp.length; r++) if (lcp[r] > lcp[best]) best = r;
    return t.substring(sa[best], sa[best] + lcp[best]);
  }
}

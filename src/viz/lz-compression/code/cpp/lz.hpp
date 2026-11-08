// LZ77 writes (offset, length, next) triples: go back offset, copy length
// characters, then add next. LZW writes dictionary codes and learns a new
// string with every code. Both decoders need nothing but the output.
#pragma once
#include <algorithm>
#include <map>
#include <string>
#include <vector>

struct Triple {
  int offset, length;
  char next;
};

inline std::vector<Triple> lz77(const std::string& text, int window = 8, int lookahead = 6) {
  std::vector<Triple> out;
  const int n = static_cast<int>(text.size());
  int pos = 0;
  while (pos < n) {
    const int longest = std::min(lookahead, n - pos - 1);  // always leave a next
    int best_off = 0, best_len = 0;
    for (int d = 1; d <= std::min(window, pos); d++) {
      int k = 0;
      while (k < longest && text[pos - d + k] == text[pos + k]) k++;
      if (k > best_len) {  // nearest wins a tie
        best_off = d;
        best_len = k;
      }
    }
    out.push_back({best_off, best_len, text[pos + best_len]});
    pos += best_len + 1;
  }
  return out;
}

inline std::string unlz77(const std::vector<Triple>& triples) {
  std::string out;
  for (const Triple& t : triples) {
    for (int i = 0; i < t.length; i++) out += out[out.size() - t.offset];  // may overlap
    out += t.next;
  }
  return out;
}

inline std::vector<int> lzw(const std::string& text) {
  std::map<std::string, int> codes;
  for (int b = 0; b < 256; b++) codes[std::string(1, static_cast<char>(b))] = b;
  std::vector<int> out;
  std::string w;
  for (char c : text) {
    if (codes.count(w + c)) {
      w += c;
    } else {
      out.push_back(codes[w]);
      const int next = static_cast<int>(codes.size());
      codes[w + c] = next;
      w = std::string(1, c);
    }
  }
  if (!w.empty()) out.push_back(codes[w]);
  return out;
}

inline std::string unlzw(const std::vector<int>& codes) {
  std::map<int, std::string> strings;
  for (int b = 0; b < 256; b++) strings[b] = std::string(1, static_cast<char>(b));
  std::string out, prev;
  for (int code : codes) {
    // A code not made yet was made by the encoder on this very step.
    const std::string cur = strings.count(code) ? strings[code] : prev + prev[0];
    if (!prev.empty()) {
      const int next = static_cast<int>(strings.size());
      strings[next] = prev + cur[0];
    }
    out += cur;
    prev = cur;
  }
  return out;
}

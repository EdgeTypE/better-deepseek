aşağıdaki koddaki copy, download gibi butonlar tüm dillerde çalışmaz.
  function stripMarkdownViewerControls(text) {
    let output = String(text || "");
    let previous = "";

    const languagePattern =
      "(?:python|javascript|typescript|tsx|jsx|html|css|json|bash|shell|sh|sql|yaml|yml|xml|markdown|md)";

    while (output !== previous) {
      previous = output;

      output = output.replace(
        new RegExp(`^\\s*${languagePattern}\\s*(?:\\r?\\n|\\s+)(?:Kopyala|Copy)\\s*(?:\\r?\\n|\\s+)(?:İndir|Download)\\s*(?:\\r?\\n)*`, "i"),
        ""
      );

      output = output.replace(
        /^\s*(?:Kopyala|Copy)\s*(?:\r?\n|\s+)(?:İndir|Download)\s*(?:\r?\n)*/i,
        ""
      );
    }

    return output;
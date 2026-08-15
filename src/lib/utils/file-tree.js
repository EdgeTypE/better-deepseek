/**
 * Build a flat, indented file tree from a list of file paths.
 * Returns rows of { name, depth, dir } sorted with folders first,
 * alphabetically within each level.
 */
export function buildTreeRows(paths) {
  const root = {};

  for (const raw of paths) {
    const parts = String(raw || "").split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        node._files = node._files || [];
        node._files.push(part);
      } else {
        node[part] = node[part] || {};
        node = node[part];
      }
    }
  }

  const rows = [];
  const walk = (obj, depth) => {
    const dirs = Object.keys(obj)
      .filter((k) => !k.startsWith("_"))
      .sort();
    const files = (obj._files || []).slice().sort();

    for (const dir of dirs) {
      rows.push({ name: dir, depth, dir: true });
      walk(obj[dir], depth + 1);
    }
    for (const file of files) {
      rows.push({ name: file, depth, dir: false });
    }
  };

  walk(root, 0);
  return rows;
}
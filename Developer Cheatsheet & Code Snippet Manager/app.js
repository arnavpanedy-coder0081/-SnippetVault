const STORAGE_KEY = "snippet-vault-items-v1";
const paletteOverlay = document.querySelector("#palette-overlay");
const editorOverlay = document.querySelector("#editor-overlay");
const paletteInput = document.querySelector("#palette-input");
const paletteResults = document.querySelector("#palette-results");
const listElement = document.querySelector("#snippet-list");
const filterInput = document.querySelector("#filter-input");
const toastElement = document.querySelector("#toast");
const languageColors = {
  JavaScript: "#f0cf70", TypeScript: "#71a7f5", Python: "#87c6a5", SQL: "#d59af3",
  Bash: "#d8a276", CSS: "#bd91ee", HTML: "#ed9877", JSON: "#d6cb7c",
  Go: "#79d0d7", Rust: "#e6a478", Other: "#b5ef72",
};
const starterSnippets = [
  { id: "fetch-abort", title: "Fetch with timeout", language: "JavaScript", tags: ["api", "async", "fetch"], code: "const controller = new AbortController();\nconst timeout = setTimeout(() => controller.abort(), 5000);\n\ntry {\n  const response = await fetch(url, { signal: controller.signal });\n  clearTimeout(timeout);\n  return await response.json();\n} catch (error) {\n  clearTimeout(timeout);\n  throw error;\n}", notes: "Use `AbortController` to cancel a request that takes too long.\n\n- Adjust the timeout to fit your use case\n- Always clear the timer when the request settles", favorite: true, createdAt: Date.now() - 1000 * 60 * 50 },
  { id: "git-cleanup", title: "Clean merged branches", language: "Bash", tags: ["git", "cleanup", "cli"], code: "git branch --merged main \\\n  | grep -vE '^\\*|main|develop' \\\n  | xargs -r git branch -d", notes: "Delete local branches that have already been merged into `main`.\n\nRun `git fetch --prune` first to refresh remote tracking branches.", favorite: false, createdAt: Date.now() - 1000 * 60 * 60 * 4 },
  { id: "python-retry", title: "Retry with exponential backoff", language: "Python", tags: ["retry", "network", "resilience"], code: "import time\n\n\ndef retry(operation, attempts=4, delay=0.5):\n    for attempt in range(attempts):\n        try:\n            return operation()\n        except OSError:\n            if attempt == attempts - 1:\n                raise\n            time.sleep(delay * (2 ** attempt))", notes: "The delay doubles after each failed attempt: 0.5s, 1s, 2s...\n\nUse a bounded number of attempts to avoid retrying forever.", favorite: false, createdAt: Date.now() - 1000 * 60 * 60 * 24 },
  { id: "sql-upsert", title: "Insert or update a record", language: "SQL", tags: ["database", "upsert", "postgres"], code: "INSERT INTO users (email, display_name)\nVALUES ('dev@example.com', 'Dev')\nON CONFLICT (email)\nDO UPDATE SET display_name = EXCLUDED.display_name\nRETURNING id, email;", notes: "PostgreSQL upsert pattern. `EXCLUDED` refers to the row that was proposed for insertion.", favorite: false, createdAt: Date.now() - 1000 * 60 * 60 * 48 },
  { id: "ts-groupby", title: "Group items by a key", language: "TypeScript", tags: ["array", "utility", "grouping"], code: "const grouped = items.reduce<Record<string, Item[]>>(\n  (groups, item) => {\n    (groups[item.category] ??= []).push(item);\n    return groups;\n  },\n  {},\n);", notes: "Build a lookup object of arrays, keyed by each item's category.", favorite: true, createdAt: Date.now() - 1000 * 60 * 60 * 72 },
];

let snippets = loadSnippets();
let activeFilter = "all";
let activeQuery = "";
let paletteSelection = 0;
let paletteMatches = [];
let sortNewestFirst = true;
let toastTimer;

function loadSnippets() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return starterSnippets;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.code === "string")) {
      throw new Error("Saved snippets have an invalid format.");
    }
    return parsed;
  } catch (error) {
    console.error("Unable to load saved snippets:", error);
    return starterSnippets;
  }
}

function persistSnippets() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    return true;
  } catch (error) {
    console.error("Unable to save snippets:", error);
    showToast("Couldn't save to local storage. Check available browser storage.", true);
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function highlightCode(code) {
  const escaped = escapeHtml(code);
  const patterns = [
    { type: "comment", regex: /(\/\/[^\n]*|#[^\n]*|--[^\n]*)/g },
    { type: "string", regex: /(&quot;.*?&quot;|&#39;.*?&#39;|`[^`]*`)/g },
    { type: "number", regex: /\b\d+(?:\.\d+)?\b/g },
    { type: "keyword", regex: /\b(const|let|var|function|return|async|await|try|catch|throw|new|if|else|for|while|import|from|export|default|class|def|in|is|None|True|False|pass|INSERT|INTO|VALUES|ON|CONFLICT|DO|UPDATE|SET|RETURNING|SELECT|WHERE|AND|OR|CREATE|TABLE)\b/g },
  ];
  let tokens = [{ text: escaped, type: "" }];
  for (const { type, regex } of patterns) {
    tokens = tokens.flatMap((token) => {
      if (token.type) return [token];
      const fragments = [];
      let lastIndex = 0;
      for (const match of token.text.matchAll(regex)) {
        const index = match.index;
        if (index > lastIndex) fragments.push({ text: token.text.slice(lastIndex, index), type: "" });
        fragments.push({ text: match[0], type });
        lastIndex = index + match[0].length;
      }
      if (!fragments.length) return [token];
      if (lastIndex < token.text.length) fragments.push({ text: token.text.slice(lastIndex), type: "" });
      return fragments;
    });
  }
  return tokens.map((token) => token.type ? `<span class="token-${token.type}">${token.text}</span>` : token.text).join("");
}

function detectLanguage(source) {
  const code = source.trim();
  if (!code) return null;
  if ((code.startsWith("{") || code.startsWith("[")) && (() => {
    try { JSON.parse(code); return true; } catch { return false; }
  })()) return "JSON";
  if (/\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE|DELETE\s+FROM)\b/i.test(code)) return "SQL";
  if (/<(!doctype|html|head|body|div|section|main|script)\b/i.test(code)) return "HTML";
  if (/(^|\n)\s*(@media|[.#][\w-]+\s*\{|[a-z-]+\s*:\s*[^;{}]+;)/.test(code)) return "CSS";
  if (/\b(def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|print\s*\(|elif\s+)/.test(code)) return "Python";
  if (/^#!.*\b(bash|sh)\b|(^|\n)\s*(git|curl|grep|awk|sed|npm|docker|kubectl)\s+/m.test(code)) return "Bash";
  if (/\b(fn\s+\w+\s*\(|let\s+mut\s+|use\s+[\w:]+;|println!\s*\()/.test(code)) return "Rust";
  if (/\b(package\s+main|func\s+\w+\s*\(|fmt\.Print|:=)/.test(code)) return "Go";
  if (/\b(interface|type)\s+\w+\s*(=|\{)|:\s*(string|number|boolean)\b|as\s+\w+/.test(code)) return "TypeScript";
  if (/\b(const|let|var|function|async|await|console\.|=>|export)\b/.test(code)) return "JavaScript";
  return null;
}

function renderCode(code) {
  return code.split("\n").slice(0, 7).map((line, index) =>
    `<div class="code-line"><span class="line-no">${index + 1}</span><span class="code-content">${highlightCode(line) || " "}</span></div>`,
  ).join("");
}

function relativeDate(timestamp) {
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3600000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function matchesFilter(snippet) {
  if (activeFilter === "favorites" && !snippet.favorite) return false;
  if (activeFilter !== "all" && activeFilter !== "favorites" && snippet.language !== activeFilter) return false;
  if (!activeQuery.trim()) return true;
  const query = activeQuery.toLowerCase();
  return [snippet.title, snippet.language, snippet.code, snippet.notes, ...(snippet.tags || [])].join(" ").toLowerCase().includes(query);
}

function visibleSnippets() {
  return snippets.filter(matchesFilter).sort((left, right) =>
    sortNewestFirst ? right.createdAt - left.createdAt : left.createdAt - right.createdAt,
  );
}

function renderLanguages() {
  const counts = snippets.reduce((result, snippet) => {
    result[snippet.language] = (result[snippet.language] || 0) + 1;
    return result;
  }, {});
  document.querySelector("#language-filters").innerHTML = Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((language) =>
    `<button class="language-item ${activeFilter === language ? "selected" : ""}" data-filter="${escapeHtml(language)}"><span class="language-dot" style="--dot-color:${languageColors[language] || "#aaa"}"></span>${escapeHtml(language)}<span class="language-count">${counts[language]}</span></button>`,
  ).join("");
}

function renderList() {
  const shown = visibleSnippets();
  document.querySelector("#all-count").textContent = snippets.length;
  document.querySelector("#heading-count").textContent = snippets.length;
  document.querySelector("#result-count").textContent = `${shown.length} ${shown.length === 1 ? "result" : "results"}`;
  const label = activeFilter === "all" ? "All snippets" : activeFilter === "favorites" ? "Favorites" : activeFilter;
  document.querySelector("#current-filter").textContent = label;
  document.querySelector("#page-title").innerHTML = `${escapeHtml(label)}<span class="heading-period">.</span>`;
  if (!shown.length) {
    const hasSnippets = snippets.length > 0;
    listElement.innerHTML = `<div class="empty-state"><div class="empty-icon">${hasSnippets ? "⌕" : "+"}</div><h2>${hasSnippets ? "No snippets found" : "Your library is waiting"}</h2><p>${hasSnippets ? "Try another search or choose a different filter." : "Save that one-liner you'll definitely need again. Your snippets stay right here on this device."}</p>${hasSnippets ? "" : '<button class="primary-button" data-empty-add type="button"><span>＋</span> Add your first snippet</button>'}</div>`;
    return;
  }
  listElement.innerHTML = shown.map((snippet) => `<article class="snippet-card" data-open-id="${escapeHtml(snippet.id)}" tabindex="0" aria-label="Open ${escapeHtml(snippet.title)}">
    <div class="snippet-info">
      <div class="snippet-topline"><span class="language-pill" style="--pill-color:${languageColors[snippet.language] || "#b5ef72"}">${escapeHtml(snippet.language)}</span><button class="copy-button" data-copy-id="${escapeHtml(snippet.id)}" aria-label="Copy ${escapeHtml(snippet.title)}" type="button">Copy code</button><button class="favorite-button ${snippet.favorite ? "is-favorite" : ""}" data-favorite-id="${escapeHtml(snippet.id)}" aria-label="${snippet.favorite ? "Remove from" : "Add to"} favorites" type="button">${snippet.favorite ? "★" : "☆"}</button></div>
      <h2 class="snippet-title">${escapeHtml(snippet.title)}</h2><p class="snippet-description">${escapeHtml((snippet.notes || "").split("\n")[0] || "No notes added yet.")}</p>
      <div class="snippet-meta">${(snippet.tags || []).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}<span class="updated-at">${relativeDate(snippet.createdAt)}</span></div>
    </div><div class="code-preview" aria-hidden="true">${renderCode(snippet.code)}</div>
  </article>`).join("");
}

function renderAll() {
  renderLanguages();
  renderList();
}

function renderMarkdown(markdown) {
  if (!markdown.trim()) return '<span class="preview-placeholder">Live preview will appear here.</span>';
  const safe = escapeHtml(markdown);
  return safe.split("\n").map((line) => {
    if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
    if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`;
    if (/^# /.test(line)) return `<h1>${line.slice(2)}</h1>`;
    if (/^\s*[-*] /.test(line)) return `<ul><li>${line.replace(/^\s*[-*] /, "").replace(/`([^`]+)`/g, "<code>$1</code>")}</li></ul>`;
    const inline = line.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return inline ? `<p>${inline}</p>` : "<br>";
  }).join("");
}

function showToast(message, isError = false) {
  toastElement.textContent = message;
  toastElement.classList.toggle("error", isError);
  toastElement.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("show"), 2600);
}

function openEditor(snippet = null) {
  document.querySelector("#snippet-form").reset();
  document.querySelector("#snippet-id").value = snippet?.id || "";
  document.querySelector("#snippet-title").value = snippet?.title || "";
  document.querySelector("#snippet-language").value = snippet?.language || "JavaScript";
  document.querySelector("#snippet-tags").value = snippet?.tags?.join(", ") || "";
  document.querySelector("#snippet-code").value = snippet?.code || "";
  document.querySelector("#snippet-notes").value = snippet?.notes || "";
  document.querySelector("#editor-title").textContent = snippet ? "Edit snippet" : "New snippet";
  document.querySelector("#delete-snippet").classList.toggle("hidden", !snippet);
  document.querySelector("#markdown-preview").innerHTML = renderMarkdown(snippet?.notes || "");
  editorOverlay.classList.remove("hidden");
  document.querySelector("#snippet-title").focus();
}

function closeEditor() {
  editorOverlay.classList.add("hidden");
}

function openPalette() {
  closeEditor();
  paletteOverlay.classList.remove("hidden");
  paletteInput.value = "";
  paletteSelection = 0;
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  paletteOverlay.classList.add("hidden");
}

function renderPalette() {
  const query = paletteInput.value.trim().toLowerCase();
  paletteMatches = snippets.filter((snippet) =>
    !query || [snippet.title, snippet.language, snippet.code, snippet.notes, ...(snippet.tags || [])].join(" ").toLowerCase().includes(query),
  ).slice(0, 12);
  document.querySelector("#palette-count").textContent = paletteMatches.length ? `· ${paletteMatches.length} results` : "";
  if (!paletteMatches.length) {
    paletteResults.innerHTML = `<div class="palette-empty">${snippets.length ? "No matching snippets. Try a different search." : "No snippets yet. Add one to get started."}</div>`;
    return;
  }
  paletteResults.innerHTML = paletteMatches.map((snippet, index) => `<button class="palette-result ${index === paletteSelection ? "selected" : ""}" data-palette-index="${index}" type="button">
    <span class="result-icon">{ }</span><span class="result-copy"><span class="result-title">${escapeHtml(snippet.title)}</span><span class="result-detail">${escapeHtml(snippet.language)} · ${(snippet.tags || []).map((tag) => `#${escapeHtml(tag)}`).join("  ")}</span></span><span class="result-arrow">↵</span>
  </button>`).join("");
}

async function copySnippet(snippet) {
  try {
    await navigator.clipboard.writeText(snippet.code);
    showToast(`Copied "${snippet.title}" to clipboard`);
  } catch (error) {
    console.error("Unable to copy snippet:", error);
    showToast("Clipboard access was denied. Check browser permissions.", true);
  }
}

document.querySelector("#open-search").addEventListener("click", openPalette);
document.querySelector("#add-snippet").addEventListener("click", () => openEditor());
document.querySelector("#export-snippets").addEventListener("click", () => {
  const payload = JSON.stringify({ format: "snippet-vault", version: 1, exportedAt: new Date().toISOString(), snippets }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `snippet-vault-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${snippets.length} ${snippets.length === 1 ? "snippet" : "snippets"}`);
});
document.querySelector("#import-snippets").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed?.snippets;
    if (!Array.isArray(incoming) || !incoming.every((item) => item && typeof item.title === "string" && item.title.trim() && typeof item.code === "string" && item.code.trim() && typeof item.language === "string")) {
      throw new Error("This file does not contain a valid snippet backup.");
    }
    const stamp = Date.now();
    const imported = incoming.map((item, index) => ({
      id: crypto.randomUUID(), title: item.title.trim().slice(0, 90), language: item.language,
      tags: Array.isArray(item.tags) ? [...new Set(item.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))] : [],
      code: item.code, notes: typeof item.notes === "string" ? item.notes : "", favorite: Boolean(item.favorite),
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : stamp + index,
    }));
    const existing = new Set(snippets.map((item) => `${item.title.toLowerCase()}\u0000${item.code}`));
    const unique = imported.filter((item) => !existing.has(`${item.title.toLowerCase()}\u0000${item.code}`));
    if (!unique.length) {
      showToast("These snippets are already in your library.");
      return;
    }
    const previous = snippets;
    snippets = [...unique, ...snippets];
    if (persistSnippets()) {
      activeFilter = "all";
      activeQuery = "";
      filterInput.value = "";
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
      renderAll();
      showToast(`Imported ${unique.length} ${unique.length === 1 ? "snippet" : "snippets"}${imported.length > unique.length ? ` · skipped ${imported.length - unique.length} duplicates` : ""}`);
    } else snippets = previous;
  } catch (error) {
    showToast(error instanceof SyntaxError ? "That file isn't valid JSON." : error.message || "Unable to import this file.", true);
  }
});
document.querySelector("#sort-button").addEventListener("click", (event) => {
  sortNewestFirst = !sortNewestFirst;
  event.currentTarget.innerHTML = `<span>↕</span> ${sortNewestFirst ? "Recently added" : "Oldest first"}`;
  renderList();
});
filterInput.addEventListener("input", () => {
  activeQuery = filterInput.value;
  renderList();
});
document.querySelector("#language-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  activeQuery = "";
  filterInput.value = "";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  renderAll();
});
document.querySelector(".side-section").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  activeQuery = "";
  filterInput.value = "";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
  renderAll();
});
listElement.addEventListener("click", async (event) => {
  if (event.target.closest("[data-empty-add]")) {
    openEditor();
    return;
  }
  const copyButton = event.target.closest("[data-copy-id]");
  if (copyButton) {
    const snippet = snippets.find((item) => item.id === copyButton.dataset.copyId);
    if (snippet) await copySnippet(snippet);
    return;
  }
  const favoriteButton = event.target.closest("[data-favorite-id]");
  if (favoriteButton) {
    const snippet = snippets.find((item) => item.id === favoriteButton.dataset.favoriteId);
    if (snippet) {
      snippet.favorite = !snippet.favorite;
      if (persistSnippets()) renderAll();
    }
    return;
  }
  const card = event.target.closest("[data-open-id]");
  if (!card) return;
  const snippet = snippets.find((item) => item.id === card.dataset.openId);
  if (snippet) openEditor(snippet);
});
listElement.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-id]")) {
    event.preventDefault();
    const snippet = snippets.find((item) => item.id === event.target.dataset.openId);
    if (snippet) openEditor(snippet);
  }
});
document.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", closeEditor));
document.querySelector("#snippet-notes").addEventListener("input", (event) => {
  document.querySelector("#markdown-preview").innerHTML = renderMarkdown(event.target.value);
});
document.querySelector("#snippet-code").addEventListener("input", (event) => {
  const detected = detectLanguage(event.target.value);
  if (detected) document.querySelector("#snippet-language").value = detected;
});
document.querySelector("#snippet-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.querySelector("#snippet-id").value;
  const previous = snippets.find((item) => item.id === id);
  const snippet = {
    id: id || crypto.randomUUID(),
    title: document.querySelector("#snippet-title").value.trim(),
    language: document.querySelector("#snippet-language").value,
    tags: document.querySelector("#snippet-tags").value.split(",").map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean),
    code: document.querySelector("#snippet-code").value,
    notes: document.querySelector("#snippet-notes").value,
    favorite: previous?.favorite || false,
    createdAt: previous?.createdAt || Date.now(),
  };
  if (!snippet.title || !snippet.code.trim()) {
    showToast("Add a title and code before saving.", true);
    return;
  }
  if (previous) snippets = snippets.map((item) => item.id === id ? snippet : item);
  else snippets.unshift(snippet);
  if (persistSnippets()) {
    closeEditor();
    activeFilter = "all";
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    activeQuery = "";
    filterInput.value = "";
    renderAll();
    showToast(previous ? "Snippet updated" : "Snippet saved to your library");
  }
});
document.querySelector("#delete-snippet").addEventListener("click", () => {
  const id = document.querySelector("#snippet-id").value;
  const snippet = snippets.find((item) => item.id === id);
  if (!snippet || !window.confirm(`Delete "${snippet.title}"? This cannot be undone.`)) return;
  snippets = snippets.filter((item) => item.id !== id);
  if (persistSnippets()) {
    closeEditor();
    renderAll();
    showToast("Snippet deleted");
  }
});
paletteInput.addEventListener("input", () => {
  paletteSelection = 0;
  renderPalette();
});
paletteResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-palette-index]");
  if (!result) return;
  const snippet = paletteMatches[Number(result.dataset.paletteIndex)];
  if (snippet) {
    closePalette();
    openEditor(snippet);
  }
});
paletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && paletteMatches.length) {
    event.preventDefault();
    paletteSelection = (paletteSelection + 1) % paletteMatches.length;
    renderPalette();
  } else if (event.key === "ArrowUp" && paletteMatches.length) {
    event.preventDefault();
    paletteSelection = (paletteSelection - 1 + paletteMatches.length) % paletteMatches.length;
    renderPalette();
  } else if (event.key === "Enter" && paletteMatches[paletteSelection]) {
    event.preventDefault();
    const snippet = paletteMatches[paletteSelection];
    closePalette();
    openEditor(snippet);
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (paletteOverlay.classList.contains("hidden")) openPalette();
    else closePalette();
    return;
  }
  if (event.key === "Escape") {
    closePalette();
    closeEditor();
  }
  if (event.key === "/" && paletteOverlay.classList.contains("hidden") &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) &&
      !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    filterInput.focus();
  }
});
paletteOverlay.addEventListener("click", (event) => {
  if (event.target === paletteOverlay) closePalette();
});
editorOverlay.addEventListener("click", (event) => {
  if (event.target === editorOverlay) closeEditor();
});
renderAll();

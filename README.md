# Snippet Vault

A small, keyboard-first snippet library that runs entirely in your browser. Snippets are saved to this browser's local storage; no account or server is required.

## Run it

Open `index.html` in a modern browser. Clipboard access is available when served from `localhost` or a secure context. The app itself has no build step or package dependencies.

## Features

- Search snippets by title, code, notes, language, and tags with **Ctrl/⌘ + K**.
- Navigate search results with the arrow keys and Enter.
- Filter by language or favorites, and sort by newest or oldest.
- Add, edit, favorite, delete, and copy snippets.
- Detect common languages from pasted code and show syntax-colored previews.
- Add Markdown notes with a live preview.
- Keep data in browser local storage on this device.
- Export a JSON backup and import it later; repeated snippets are skipped automatically.

Example snippets are shown when no saved library exists. Changes are stored in local storage; clearing browser storage resets the library to those examples.

## Back up your library

Use **Export** in the top bar to download a JSON backup. **Import** accepts a backup from Snippet Vault or a JSON array of snippets. Imported entries are added to the current library; entries with the same title and code are skipped.

# Lens

Visual browser for `ai-db-investigator` investigation sessions.

## What it does

- Browses `investigations/<env>/<engine>/<session>/` without running any scripts.
- Renders `schema.mermaid` as a live ER diagram (Mermaid).
- Renders `investigation-report.md`, `entity-map.md`, and `database-profile.md` as formatted Markdown.
- Shows every query file in the session with metadata and a one-click copy button.
- Lets you switch environment and engine from dropdowns.

## How to open

Open `lens/index.html` directly in **Chrome** or **Edge** (File System Access API required):

```
Open File → skill-ai-db-investigator/lens/index.html
```

Or serve from the project root with any static server:

```powershell
cd C:\development\projects\ai-db-investigator
npx serve .
# then navigate to http://localhost:3000/lens/
```

## Usage

1. Click **Open Project Root** and select the `ai-db-investigator` folder.
2. Select an **Environment** from the dropdown (e.g. `development`).
3. Select a **DB Engine** (e.g. `postgres`).
4. The left panel loads: Schema Diagram, Entity Map, DB Profile, and Sessions list.
5. Click any session card to view its Investigation Report and individual query files.
6. Use **Refresh** to reload sessions after new investigations are run.

## Requirements

- Chrome 86+ or Edge 86+ (for `window.showDirectoryPicker`).
- No build step. No install. No server required.
- CDN access needed for Mermaid and Marked libraries.

## Notes

- Lens is read-only — it never writes to the filesystem.
- It reads `investigations/` for sessions and `db-context/` for schema/entity context.
- If `db-context/<env>/<engine>/` does not exist, the left panel shows empty placeholders.

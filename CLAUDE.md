# LS-DW Project Notes (for AI assistants)

A Dreamweaver-like visual web page editor for practicing Shanghai college Computer Level 1 DW operations.
Electron 33 + vanilla HTML/CSS/JS, no framework. See README.md.

## Key conventions

- Renderer scripts load at the bottom of index.html in dependency order and are all attached to window globals (no ESM); modules reference each other at runtime
- The design view is an iframe (srcdoc); **all DOM operations must go through the DomOps/Editor layer**, and after every change you must call `App.afterMutation({commit})` to sync the code view and the undo stack (commit:true = push immediately, false = 500ms debounce/merge)
- Exports must be clean: Serialize.cleanClone strips data-dw-*, contenteditable, #dw-editor-style and tbody, and restores the extracted <script> (the design view does not execute scripts)
- Properties panel fields all write HTML attributes (bgcolor/align/size etc.), matching the exam answer style; fonts wrap inline content in <font face size color>, while block-level content falls back to CSS
- Table operations are based on the buildGrid grid algorithm; colspan/rowspan must keep the grid consistent
- The IPC whitelist is in preload.js; renderer fs/path operations always go through dwAPI (async, remember await)

## Environment notes (local machine)

- The user's system environment variables contain a leftover `ELECTRON_RUN_AS_NODE=1` (which degrades Electron to plain Node); the start script and test helpers strip it automatically
- main.js calls `app.disableHardwareAcceleration()`, fixing intermittent renderer crashes caused by the local GPU
- Tests use Playwright to launch the real app: `npm run test:main` / `npm run test:advanced`
- Dependencies use a domestic mirror (.npmrc is configured)

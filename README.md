# LS's DW - Dreamweaver-style visual web page editor

> **LS-DW = Lewis South - Design Workbench** * [GitHub repository](https://github.com/Lewis34566/LS-Design-Workbench)

A web page editor for practicing the **Shanghai college Computer Level 1 DW (Web Page Authoring) operation tasks**.
Tech stack: Electron (desktop edition) + vanilla HTML/CSS/JS, no framework.

## Online use (no installation required)

**Direct URL: <https://lewis34566.github.io/LS-Design-Workbench/>**

Runs entirely in the browser with no Node.js installation: open it and start working; files are stored in the visitor's own browser
and can be downloaded with "Export HTML". Phone operation is supported (panel minimization / global zoom / long-press menu).
The online edition source lives in the [`docs/`](./docs/) directory of this repository.

## Quick start

```bash
npm install        # The domestic mirror is already configured (registry.npmmirror.com)
npm start          # Run directly
```

> Warning: if the window closes immediately after startup or the console reports `ipcMain undefined`, check whether
> `ELECTRON_RUN_AS_NODE=1` is left in the system environment variables (this project's start script clears it automatically;
> to fix it permanently, delete it under "System Properties -> Environment Variables", because it degrades every Electron
> application to plain Node mode).

## UI layout (consistent with Dreamweaver)

```
+-----------------------------------------------------------+
| Toolbar: New/Open/Site/Save/Save As/Preview | Code-Split-Design | Undo/Redo |
+----------+--------------------------------+------------------+
| Left     | Center editing area            | Right: Properties |
| Insert   |  + Design view (iframe, clickable) | Generated from the |
| File tree|  + Code view (syntax highlight + line numbers) | selected element type |
| CSS panel|                                |                  |
+----------+--------------------------------+------------------+
| Status bar: element breadcrumb (clickable) | selection size | mode | modified* |
+-----------------------------------------------------------+
```

## Core operations

| Operation | How |
|---|---|
| Select an element | Single click (blue highlight; **Ctrl+click** adds cells in the same table to the selection) |
| Edit text directly | **Double-click** to edit; Enter inserts a line break (Enter in a list item = new item); Esc finishes |
| Delete | Delete key / context menu / delete button in the properties panel |
| Select body (page properties) | Click an empty area of the page |
| Undo / redo | Ctrl+Z / Ctrl+Y (inside the code view, the native textarea undo applies) |
| Save / Save As / New | Ctrl+S / Ctrl+Shift+S / Ctrl+N |
| Code -> design sync | After editing in the code view, press **F5** or switch back to Design/Split view |
| Insert commands | Left panel buttons or the top "Insert" menu (covers all exam topics) |

## Level 1 exam topics covered (all implemented)

1. **Page properties**: title, background color `bgcolor`, background image `background`, text color `text`, link colors, margins `leftmargin/topmargin`, page-wide font/size
2. **Text**: headings 1-6, paragraphs, fonts (SimSun/SimHei/Microsoft YaHei/KaiTi/Arial -> `<font face>`), sizes 1-7 (`<font size>`), color, **bold/italic/underline** (`<b>/<i>/<u>`, click again to remove), alignment `align`, line break `<br>`, space `&nbsp;`, special characters (copyright/registered/trademark/yen), insert date
3. **Lists**: `<ul>` bulleted list, `<ol>` numbered list (including the `start` attribute)
4. **Images**: pick a local file -> **automatically copied into the site `images/` folder** -> inserted with a relative path; width and height written automatically; alt/width/height/border/alignment/margins configurable; replace image; make it a hyperlink
5. **Hyperlinks**: text/image links, target (_blank/_self/_parent/_top), `mailto:` email links, **named anchors + `#anchor` links**, empty link `#`, remove link
6. **Tables**: dialog for rows and columns; table attributes (width/border/padding/spacing/alignment/background color/background image); cell attributes (horizontal/vertical alignment, width/height, background color, no-wrap); **merge cells** (Ctrl+multi-select a rectangular region, writes `colspan/rowspan` correctly), **split cells**, insert row above/below, insert column left/right, delete row/column (grid-based algorithm that handles row and column spans correctly)
7. **Media**: horizontal rule (width/height/alignment/shading/color), scrolling text `marquee` (direction/behavior/speed/loop/background color), video/audio (video/audio, the modern replacement for Flash), background music `bgsound` (written into head)
8. **Forms**: form (action/method/name/target), text field, password field, text area, radio button, checkbox, drop-down menu (list value editor), submit/reset buttons, with their name/value/size/checked attributes
9. **CSS**: live editing of the internal stylesheet; create **tag/class/ID** selector rules (generated by a dialog); apply a class to an element (with autocomplete for existing class names); **link an external .css file** (copied into the site automatically); external CSS files can be edited and saved directly in the CSS panel
10. **Other**: iframe frames (source/width/height/scrolling/border), navigation bar (hyperlink list dialog), site folder management (file tree, create and switch between multiple HTML pages, rename/delete)

## Design notes

- **Every property change is really written into the DOM** and synchronized to the code view immediately (design -> code in real time; code -> design on F5 / view switch)
- **Exports are absolutely clean**: serialization removes every trace injected by the editor (selection highlight attributes, `contenteditable`, the editor stylesheet) and strips the `<tbody>` that browsers add automatically; `<script>` elements in the page are preserved verbatim on export (they are not executed in the design view, so they cannot interfere with editing)
- Undo/redo: a full-page HTML snapshot stack (100 steps); consecutive changes (typing, dragging a color) are merged automatically into a single step

## Automated tests

Every feature module has Playwright verification (it launches the real Electron app and operates it):

```bash
npm run test:main       # Main paths: selection -> font/size/color/background, page properties, image insertion, undo, clean export
npm run test:advanced   # Advanced: table rows/columns and merge/split, forms, CSS rules, links, code <-> design sync
npm test                # Everything
```

Screenshots from test runs are stored in `tests/out/`.

## Packaging and release

```bash
npm run dist
```

The output is in `dist/`: an NSIS installer plus a portable executable.
Configuration lives in the `build` field of `package.json` (you can change `productName` and add an `icon`).

## Directory structure

```
LS-DW/
+-- main.js               # Main process: window, menus, IPC (dialogs/file system/paths)
+-- preload.js            # Renderer security bridge (contextBridge)
+-- renderer/
|   +-- index.html        # UI skeleton
|   +-- css/app.css       # Dark theme styles
|   +-- js/
|       +-- app.js        # Assembly: mode switching, two-way sync, shortcuts, undo, context menu
|       +-- editor-core.js# Design view: selection/highlight/double-click editing/Delete/hover
|       +-- dom-ops.js    # DOM operations: insertion, font wrapping, table grid algorithm (colspan/rowspan)
|       +-- properties.js # Properties panel (generated per element type) + CSS panel
|       +-- insert-panel.js # Insert panel and the various insertion dialogs
|       +-- site-manager.js # Site file tree, open/save, image copying and relative paths
|       +-- code-view.js  # Code view (syntax highlighting + line numbers)
|       +-- serialize.js  # Clean serialization
|       +-- dialogs.js    # Modal dialogs / context menu
|       +-- undo.js       # Snapshot stack
|       +-- state.js      # Global state and events
+-- tests/                # Playwright verification scripts + screenshot output
```

## Known limitations

- `marquee`/`bgsound` are obsolete tags, provided only for exam practice (most modern browsers still display them)
- Flash has left the stage; the Flash part of the exam topics is covered by `video/audio`
- The number of parts when splitting a cell cannot exceed the original cell's colspan/rowspan span (the dialog shows the upper limit)
- Undo in the code view uses the textarea's native undo; after leaving the code view, the full-page snapshot stack takes over

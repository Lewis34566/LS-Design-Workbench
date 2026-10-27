# LS's DW Usage Guide

> Dreamweaver-style visual web page editor - writing code through the properties panel is less cumbersome than in Dreamweaver
> Intended for: students, front-end programmers, design and art professionals
> Advantage: no Dreamweaver installation required; the UI and interaction model are the same
> GitHub: https://github.com/Lewis34566/LS-Design-Workbench

1. Installation and startup

1. Install [Node.js](https://nodejs.org/en) (version 18 or later)
2. Install dependencies the first time:
   ```bash
   cd D:\LS-DW
   npm install
   ```
3. On every later use:
   ```bash
   npm start
   ```

> Troubleshooting a window that closes immediately: if the window disappears right after startup, check whether `ELECTRON_RUN_AS_NODE=1`
> is present in the system environment variables; if so, delete it ("This PC -> Properties -> Advanced system settings -> Environment Variables").
> It degrades every Electron application to plain Node mode.

2. UI overview (consistent with the three Dreamweaver views)

| Area | Purpose |
|---|---|
| Top toolbar | New / Open / Open Site / Save / Save As / Browser Preview / Code-Split-Design switch / Undo-Redo |
| Left column | Three tabs: Insert (all exam topic elements) / Files (site file tree) / CSS (stylesheets) |
| Center | Design view (WYSIWYG) + code view (syntax highlighting, line numbers) |
| Right column | Properties panel: shows the properties of whatever element is selected; changes apply immediately and are written into the code |
| Bottom status bar | Element path breadcrumb (click to jump to a parent element), selected element size, view mode, unsaved marker |

3. Basic operations (learn these first)

| Operation | How |
|---|---|
| Select an element | Single click (blue highlight) |
| Select the whole page | Click an empty area of the page (the properties panel switches to "Page Properties") |
| Edit text | Double-click the text to edit; click elsewhere to finish |
| Delete an element | Press Delete, or right-click -> Delete Element |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Save | Ctrl+S; saving an unsaved file opens Save As |
| Code -> design sync | After editing in the code view, press F5 or switch back to the design view |
| Select multiple table cells | Ctrl+click to add them one by one |

4. Working through the exam topics (practice reference)

1. Page properties (select body, then "Page Properties" in the right column)
- Title -> written into <title>
- Background color / background image (the image is automatically copied into the site `images/` folder when you click "Browse...") -> `bgcolor` / `background`
- Text color (default color for the whole page) -> `text`
- Link color / visited / active -> `link` / `vlink` / `alink`
- Left margin / top margin -> `leftmargin` / `topmargin`
- Page-wide font / size -> the body CSS font

2. Text (left column "Insert -> Text"; select a text element and change its properties)
- **Paragraph, headings 1-6**: after insertion, "Format" in the right column converts freely between them (including "No formatting")
- **Font** (SimSun/SimHei/Microsoft YaHei/KaiTi/Arial) -> generates the standard exam form `<font face="SimHei">`
- **Size**: 1-7 -> `<font size="5">`; color -> `color="#ff0000"`
- **Bold** B / italic I / underline U: click once to apply, click again to remove
- **Alignment**: left / center / right / justify -> `align`
- **Line break** `<br>`, space `&nbsp;`, special characters (copyright, registered, trademark, yen), insert date (three formats)

3. Lists
- Insert "Bulleted list / Numbered list"; selecting a ul/ol lets you switch the type and set the start number in the right column
- **Double-click to edit inside a list item; Enter automatically creates the next item**

4. Images
- "Insert image..." -> pick a local image -> **automatically copied into the site `images/` folder and inserted with a relative path**, with width and height written automatically
- The right column can change: alt text, width, height, border, alignment, horizontal/vertical margins
- "Browse..." = **replace image**; "Make hyperlink..." = add a link to the image

5. Hyperlinks
- Select **text or an image** -> "Hyperlink..." -> enter the address and choose the target (`_blank` new window / `_self` current window)
- Email link: choose the "Email" type -> `mailto:` is generated automatically
- Named anchor: insert "Named anchor..." (name it e.g. `top`) -> then insert a hyperlink, choose the "Anchor link" type and pick the anchor name -> generates `#top`
- Empty link: generates `href="#"`
- A selected link can have its address/target/title changed directly in the right column, or use "Remove link (keep content)"

6. Tables
- "Insert table...": specify rows x columns, width, border, padding, spacing
- Select the **table**: width/border/padding/spacing/alignment/background color/background image
- Select a **cell**: horizontal/vertical alignment, width/height, background color, no-wrap
- **Merge cells**: Ctrl+click adjacent cells -> "Merge cells" in the right column (writes `colspan`/`rowspan` automatically)
- **Split cell**: select a cell -> "Split cell..." -> enter how many rows and columns (cannot exceed the original spans; the dialog shows the upper limit)
- Insert row above/below, insert column left/right, delete row/column: right column "Table operations" or the context menu

7. Horizontal rule / scrolling text / media
- Horizontal rule: width (e.g. `80%`), height, alignment, shading, color
- Scrolling text `<marquee>`: text content, direction (left/right/up/down), behavior (scroll/slide/alternate), speed, loop count, background color
- Video / audio: pick a file and it is copied into the site automatically; width/height, controls, autoplay, loop configurable (the modern replacement for the Flash exam topic)
- Background music `bgsound`: pick an audio file -> written into `<head>`; loop count configurable

8. Forms
- Insert a "Form" first (red dashed box; select it to set action / method / name / target), then insert controls inside it
- Text field/password field: name, value, size (character width), maxlength
- Text area: rows, cols, initial value, wrap mode
- Radio button/checkbox: name, value, **initially checked**
- Drop-down menu: name, size, multiple-select switch, **"Edit list values..."** to maintain options (value + display text; add, delete, reorder)
- Submit/reset buttons: value is the text shown on the button

9. CSS
- **Internal stylesheet**: edit the `<style>` content directly on the "CSS" tab in the left column; changes apply in real time
- **New rule**: choose a "class/ID/tag" selector -> name it -> tick font/size/color/background/alignment (you can also type other properties freely) -> written into the stylesheet automatically
- **Apply class**: select an element -> right column "General -> Class" and enter the class name (defined classes are autocompleted)
- **External CSS**: "Link External CSS..." (copied into the site automatically) or "New CSS File" (creates and links it at the same time); click a .css file in the file tree to edit and save it directly in the CSS panel

10. Frames / navigation bar / site
- **iframe**: source, width/height, name, alignment, scrolling, border, margins
- **Navigation bar**: one "text + link" per row; generates a centered hyperlink list automatically
- **Site folder**: "Open Site" -> the file tree in the left column shows all files; "New Page" creates multiple HTML pages you can switch between; right-click a file to rename/delete it

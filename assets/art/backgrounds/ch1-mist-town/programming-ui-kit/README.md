# SPCG Programming UI Kit

This folder contains the UI elements extracted from the focused programming level design.

Source art direction:

- `../programming-main-review-v2-focused-ide.png`
- `../programming-bg-clean-v1.png`

Asset policy:

- SVG files are the primary frontend assets.
- PNG files are generated previews/fallbacks from the SVG files.
- The clean background remains separate. IDE, task panels, buttons, icons, and level nodes should be real frontend layers.

Key layout:

- Left task column: 24-28% width, full height.
- Right workbench: 72-76% width.
- IDE frame: no file tabs, editor first.
- Results dock: fixed below editor.
- Buttons: right side of result dock.

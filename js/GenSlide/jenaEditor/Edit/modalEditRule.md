# Modal Edit Rules

## Purpose
- Define stable editing rules for object move/resize inside the Jena editor.
- Prevent layout breakage during object manipulation.
- Keep behavior consistent between WYS editor and HTML code sync.

## Core Principles
1. Preserve flow space during move:
   - When a flow object is moved with `MOVE` handle, keep a placeholder at the original position.
   - Do not allow other elements to reflow into the old space while dragging.

2. Use base-layer anchoring for moved objects:
   - Promote moved object to `position:absolute` anchored to the current base layer.
   - Keep `left/top/width/height` explicit after promotion.
   - Remove transform side effects (`transform:none`) to avoid first-move jump/drop.

3. No initial overlap for new text boxes:
   - New `.jena-textbox` must be placed in a free spot.
   - Placement checks intersection against existing text boxes.
   - If overlap is detected, auto-shift until a valid free position is found.

4. Stable selection state:
   - Selecting an object must not move it.
   - Dragging starts only from dedicated handles.
   - Object edit UI should not affect saved HTML output.

5. Sync safety:
   - Apply/save must serialize final coordinates to HTML code.
   - Temporary UI nodes (`data-jena-ui`) and placeholders are excluded from export/save output.

## Placeholder Rule
- Placeholder metadata:
  - moved object: `data-jena-move-id`
  - placeholder: `data-jena-placeholder-for`
- Placeholder lifecycle:
  - create when first promoting object for move
  - keep while editing/moving
  - clear on apply/deselect/edit-mode off

## Expected Outcomes
- Move handle drag does not collapse surrounding layout.
- Objects do not auto-drop to lower positions during first move.
- Newly inserted text boxes do not stack on top of each other by default.

# Checkbox controls

`app/checkboxes.css` owns checkbox sizing and label layout across the workspace and customer pages. A checkbox is an 18 px native control beside sentence-case text, with a wrapping description, native checked/disabled behavior and visible keyboard focus. Wrap the input and description in a label. Text-first markup also works, but input-first markup is preferred.

Do not give a checkbox a text-field width, padding, minimum height, or uppercase field-heading style. General text-field selectors must exclude `input[type="checkbox"]` and `input[type="radio"]`. Keep control layout in the shared stylesheet instead of adding page-specific size overrides.

The existing Automation switch, onboarding confirmation and legacy MSA consent use visually hidden native inputs and separate visual indicators. Those explicit exceptions stay intact. Add new exceptions only for an intentional custom control with keyboard, focus, checked and disabled behavior.

The checkbox layout regressions verify actual control and text geometry in settings, light/dark themes, mobile and customer paperwork. Keep those checks when changing form or label styles.

<!--
Incident catalog. The review judge walks through these items after approving and reports, for each,
why it does not apply or what it tried. Build it from incidents that actually happened in your repository:
with only generic items, the residual-risk report tends to say "nothing in particular".
One bullet per item. Add a line at the end about how to try things if the app is hard to run in tests.
-->
- **Empty or broken input**: paths where empty input, a missing file, or malformed data looks like success but does nothing
- **Missing `await` / unhandled errors**: a Promise or error value used as if it were the result, so a check is always true or a failure is silent
- **Untrusted values reaching output**: values from user input or imported files written into HTML, attributes, shell commands, or file paths without escaping

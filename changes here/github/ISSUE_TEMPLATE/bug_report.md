---
name: Bug report
about: Create a report to help us improve
title: ''
labels: bug
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Device(please complete the following information):**
 - OS: [e.g. Windows, Linux]
 - Browser [e.g. Chrome, Firefox]


**Additional context**
Add any other context about the problem here.

---

## Advanced Users

If you are comfortable with the browser console, you can enable debug logging before reproducing the issue:

1. Open the console (`F12` → Console)
2. Run: `localStorage.setItem("bds:devlog", "true")`
3. **Refresh the page (`F5`)** — required, value is read once at startup
4. Reproduce the problem
5. Copy the console output (`[BDS:MCP]`, `[BDS:Cmd]`, etc.) and paste it into your report

To disable: `localStorage.removeItem("bds:devlog")` + refresh.

---
name: Deploy footer config
description: Footer content is injected via VITE_FOOTER_HTML at build time — empty by default, must be passed explicitly
type: project
---

Footer shows "by @rijdho" linking to life.rijdho.org. Set via VITE_FOOTER_HTML env var at build time. If omitted, footer renders empty.

**Why:** The footer is not hardcoded — it's a build-time env var that defaults to empty string.
**How to apply:** Always include VITE_FOOTER_HTML in the deploy command for the frontend.

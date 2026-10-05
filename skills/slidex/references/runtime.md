# Runtime discovery and installation

Read only if the SlideX CLI is missing or a rendering dependency fails. The skill contains guidance and Python QA helpers, not a bundled SlideX runtime.

Resolve the absolute skill directory from the loaded `SKILL.md`; scripts and references are relative to it, never necessarily to the working directory. Run `slidex version` or `slidex help`. In a built checkout use `node /absolute/slidex/dist/cli.js`; retain that invocation for subsequent commands. This project is published as `@xiahan/slidex`; the unrelated unscoped npm package is not a substitute.

Use Node 18+ (CI uses 22). When installation is authorized, the release candidate is:

```sh
npm install -g @xiahan/slidex@next
slidex version
```

The default npm `latest` tag may be older. To build source, use a fresh checkout outside an existing deck:

```sh
git clone https://github.com/vtuber-plan/slidex.git
cd slidex
npm ci
npm run build
node dist/cli.js version
```

Inspect existing checkout changes before updating; never use reset/clean to discard them. A versioned CLI `.tgz` from GitHub Releases is another option. Installing a runtime does not register the skill; copy the complete `skills/slidex/` folder separately when skill installation is requested. Do not perform an unrelated installation automatically; respect existing task authorization.

Chrome/Edge/Chromium is required by the current export pipeline; set `CHROME_PATH` when discovery fails. Without it, sources and validation remain possible, but rendering/exports are blocked and delivery is partial. Local assets render offline; remote images/fonts need network and fonts may fall back.

Python 3.10+ and Pillow 10+ are needed for `scripts/contact_sheet.py`; `scripts/inspect_pptx.py` uses only the Python standard library. If Pillow is absent, the helper prints the install command (`python -m pip install Pillow`) without executing it. Use direct PNG review if stitching is unavailable. A missing QA helper dependency must not be confused with a missing SlideX runtime.

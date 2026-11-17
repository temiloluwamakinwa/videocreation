# Video Creation

Prompt in, MP4 out. Write what your product is, get a vertical, landscape or square motion launch
video with a synthesized soundtrack. Every frame is HTML computed from time (`seek(t)`), rendered
with Playwright and ffmpeg (real motion blur), no video AI model involved.

The render engine, `launch` template and synth are adapted from
[chalidade/vigenco](https://github.com/chalidade/vigenco) (MIT). See `NOTICE` and `LICENSE`.

```
prompt ─► bin/direct.mjs (Claude API) ─► jobs/generated/<id>.json ─► bin/vigenco.mjs render ─► out/<id>.mp4
```

## Use it locally

```bash
npm install && npx playwright install chromium   # ffmpeg must be on PATH
npm run draft -- jobs/example.json               # fast preview → out/example.mp4
npm run render -- jobs/example.json              # 60 fps with motion blur
npm run snap -- jobs/example.json                # one still per beat, to check text
```
Set `CHROMIUM_PATH` to use an existing Chrome/Chromium instead of Playwright's download.

A job is a small JSON file (see `jobs/example.json`): brand, intro lines, a typed brief, three
feature cards (toggle, slider, tabs), optional stat and logos, and an outro.

## Prompt to video from the browser (GitHub Pages + Actions)

1. **Secret:** Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`
   (optional variable `CLAUDE_MODEL`).
2. **Pages:** Settings → Pages → Deploy from a branch → `main` / `/docs`.
3. Open the page, click **Settings**, paste a fine-grained token for this repo
   (Contents and Actions: read and write). It stays in your browser only.
4. Write a prompt, pick a format, **Create video**. The page commits `requests/<id>/request.json`,
   starts the **Generate video** workflow (director, render, GitHub Release `video-<id>`),
   then plays the MP4. Works best on a **public** repo.

Command-line equivalent:
```bash
ANTHROPIC_API_KEY=… node bin/direct.mjs requests/<id>/request.json jobs/generated/<id>.json
```
The **Render job** workflow renders any job file from the Actions tab.

## Your own film
A job with `"entry": "my-film/index.html"` renders a custom `seek(t)` page. Run `node bin/vigenco.mjs init`
for an example, and see `types/_shared/motion.js` for the motion primitives.

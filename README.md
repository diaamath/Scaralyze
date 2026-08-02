# Scaralyze

An interactive, in-browser tool for tracking scar/skin texture change between a "pre" and "post" photo. Built for two modes:

- **Clinician view** — full dashboard: manual or auto-detected sampling region, adjustable window size and difference threshold, texture maps, difference map, metrics table.
- **My progress** — a simplified version for a patient tracking their own healing: before/after slider, one auto-picked region, plain-language summary.

Everything (grayscale conversion, local standard deviation, Sobel edge-density "texture map", difference map, thresholding, and the PDF report) runs **entirely client-side** in the browser via `<canvas>`. No photo is ever uploaded to a server — this is plain static HTML/CSS/JS, so it works on GitHub Pages with no backend.

## Important limitations (please read)

- **Not a diagnostic device.** The "texture map" is a Sobel edge-magnitude image, a proxy for surface texture/edge density — it is *not* a validated collagen or scar-severity measurement. Treat the numbers as a relative, same-device/same-lighting comparison aid, not a clinical score.
- **No real accounts.** GitHub Pages only serves static files — there's no server or database. "Clinician" vs "Patient" is a UI mode toggle in this app, not secure login. Don't rely on it to restrict access to real patient data.
- **Photos stay local.** Nothing is transmitted anywhere; the PDF is generated and downloaded directly in the browser.
- For best results, use two photos taken with similar lighting, angle, and distance.

## Files

```
index.html   — structure + content
style.css    — design system / styling
app.js       — image processing, region selection, PDF export
README.md    — this file
```

## Run locally

No build step needed. Either:

- Open `index.html` directly in a browser, or
- Serve it locally (recommended, avoids some browser file:// restrictions):
  ```bash
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

## Host on GitHub Pages

1. Create a new GitHub repository (e.g. `scaralyze`), or use an existing one.
2. Add these three files (`index.html`, `style.css`, `app.js`) to the repo root — either via the GitHub web UI ("Add file → Upload files") or:
   ```bash
   git init
   git add index.html style.css app.js README.md
   git commit -m "Scaralyze: initial site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. On GitHub: go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`, **Branch** to `main` and folder to `/ (root)`, then **Save**.
5. Wait a minute, then your site will be live at:
   ```
   https://<your-username>.github.io/<your-repo>/
   ```
6. Any time you push changes to `main`, GitHub Pages redeploys automatically (usually within a minute).

## Customizing

- Colors, fonts, and layout are all in `style.css` (see the token list at the top of the file).
- Brand name / copy lives in `index.html`.
- Analysis logic (window size defaults, threshold defaults, summary sentence wording) is in `app.js`.

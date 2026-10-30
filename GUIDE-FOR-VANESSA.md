# Tarot Flower — Working on Your Site with Codex

You can make changes to your website by talking to Codex. Describe what you want in plain English, review the local result, and authorize any production deployment separately.

---

## Getting Started

### Open the project

1. Open Terminal (or the Codex desktop app)
2. Navigate to the project:
   ```
   cd /path/to/tarotflower-web
   ```
3. Start Codex:
   ```
   codex
   ```

That's it. You're now talking to an AI that understands the entire site.

### What you can ask Codex to do

Just describe what you want in plain language. Examples:

- "Change the title of the Fool tarot page to 'The Fool — Leap of Faith'"
- "Add a new blog post about the full moon in Cancer"
- "Move the astrology section higher on the homepage"
- "Make the heading fonts bigger on mobile"
- "The image on the pentacles page is wrong, replace it with /images/2023/04/new-pentacles.jpg"
- "Add a new product for a group reading, price is $120"
- "Fix the typo on the contact page — it says 'reeading' instead of 'reading'"

Codex will make only the changes you authorize. Your published writing, metadata copy, and artwork are not rewritten unless you explicitly request that editorial change.

---

## Previewing Your Changes

After Claude makes changes, you want to see them before they go live.

### Start the local dev server

Ask Codex:
> "Start the dev server"

Or run it yourself:
```
npm run dev
```

Then open **http://localhost:4321** in your browser. You'll see the site exactly as it will look when deployed. Changes show up in the browser as soon as Claude saves them.

### Build the site

Before deploying, always build to make sure nothing is broken:

Ask Codex:
> "Build the site"

Or:
```
npm run build
```

If it says "Complete!" with no errors, run the regression suites as well. A successful build alone does not prove route, redirect, or private-runtime integrity.

---

## Deploying (Making It Live)

The site is served by the `tarotflower-web` Cloudflare Worker. Committing, pushing, and deploying are separate actions.

Ask Codex only when you are ready:
> "Commit these changes, but do not push or deploy"

For a production release, give a second explicit instruction after reviewing the commit and test report. Codex then uses the existing Worker deployment workflow and verifies the live site.

**Only authorize deployment when you're happy with what you see locally.** A push or deployment is never implied by a local change or commit.

---

## Common Tasks

### Editing a post or page

> "Open the fool tarot page and change the second paragraph to say..."

> "Add this text to the bottom of the astrology page: [your text]"

> "Remove the image from the swords tarot page"

All content lives in `src/content/posts/` as markdown files. Each file has a header (frontmatter) with the title, slug, date, and SEO info, followed by the page content. Claude knows all this.

### Adding a new post

> "Create a new blog post called 'Full Moon in Pisces March 2026' with this content: [paste your text]"

Claude will create the markdown file with proper frontmatter and slug.

### Changing styles

> "Make the body text slightly larger"

> "Change the purple accent color to a deeper plum"

> "Add more space between the header image and the first heading"

All styles are in one file: `public/styles/global.css`. Claude knows the color scheme, fonts, and layout rules.

### Adding images

1. Put the image file in `public/images/` (you can drag it into Finder, or ask Claude to organize it)
2. Tell Claude where to use it:
   > "Add this image at the top of the cups tarot page: /images/my-new-cups-image.jpg"

### SEO

> "Update the SEO description for the high priestess page"

> "What pages are missing SEO descriptions?"

Each page has `seo_title` and `seo_description` fields in its frontmatter. These control Google search results.

---

## Things to Know

- **Git preserves history, but production actions still require care.** Ask Codex to show the exact diff and test evidence before release.
- **Always build and run the regression suites before deployment.** `npm run build` alone is not the complete release gate.
- **One thing at a time works best.** "Change the heading on the astrology page" is better than "redesign the astrology page." You can always ask for more.
- **You can say no.** If Claude makes a change you don't like, just say "undo that" or "no, I meant..."
- **Images go in `public/images/`.** Reference them as `/images/your-file.jpg` (no `public` in the path).
- **The slug is the URL.** A post with `slug: the-fool-tarot` lives at `tarotflower.com/the-fool-tarot`.

---

## Quick Reference

| Task | What to say |
|------|-------------|
| Start local preview | "Start the dev server" |
| Stop local preview | Press Ctrl+C in terminal |
| Check for errors | "Build the site" |
| Commit locally | "Commit these changes, but do not push or deploy" |
| Deploy to live site | Give explicit production deployment approval after review |
| Undo a change | "Undo that last change" |
| See what changed | "Show me what files changed" |

# Issue tracker: Notion

Issues and specs for this repo live as rows in Kyle's Notion **Tasks** database, scoped to the **Mise AI** project. Use the Notion MCP tools (`notion-search`, `notion-fetch`, `notion-query-data-sources`, `notion-create-pages`, `notion-update-page`, `notion-create-comment`, `notion-get-comments`). There is no CLI; if no Notion MCP tool is available, stop and tell the user rather than falling back to GitHub Issues.

- Tasks data source: `collection://09ebaa60-8395-47e0-bc07-5b43a2e25414` (https://app.notion.com/p/6d464b5aafef4bd0bd000b83ae4b90f3)
- Mise AI project page: https://app.notion.com/p/3f47783b213581fdbf8fe304425fa017
- Fields: `Name` (title), `Status` (To do / Doing / Done), `Notes` (text), `Project` (relation), `Due` (date), `Source`, `Client`. There is **no label, priority or assignee field**.
- An issue's identifier is its Notion page URL (or page id). Never use `#123` numbers; those are GitHub PRs.

## Conventions

- **Create an issue**: `notion-create-pages` with parent = the Tasks data source; `Name` = title; `Project` = Mise AI page; `Status` = `To do`; put the triage line (see below) at the top of `Notes`, followed by a short summary. Put the full body (spec, acceptance criteria, agent brief) in the page content.
- **Read an issue**: `notion-fetch` the page URL (properties + page content), plus `notion-get-comments` for discussion.
- **List issues**: `notion-query-data-sources` on the Tasks data source, filtered to `Project` contains Mise AI and `Status` != `Done`. Never list or touch rows from other projects.
- **Sub-issue of a parent**: put `Part of: <parent page URL>` as the first line of the child's page content, and add a link to the child in a `## Tickets` list in the parent's content.
- **Comment on an issue**: `notion-create-comment` on the page.
- **Apply / remove labels**: no label field. Labels are stored as a first line in `Notes` of the form `Triage: <state> | Type: <bug|enhancement>` (other labels such as `wayfinder:map` appended as `| Tags: ...`). Applying a label = rewriting that line with `notion-update-page`; don't touch the rest of `Notes`.
- **Close**: set `Status` = `Done` and add a closing comment. For `wontfix`, also set `Triage: wontfix`.
- **Status mapping**: `Doing` = claimed / in progress. `To do` = open. `Done` = closed.
- Never delete rows or edit rows outside the Mise AI project. Don't rename fields or change the database schema.

## Pull requests as a triage surface

**PRs as a request surface: no.** PRs stay on GitHub (`kgreer0210/recipe-gen-app`); they are not tracked in Notion.

## When a skill says "publish to the issue tracker"

Create a Notion Tasks row as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

`notion-fetch` the page URL the user gives; if they give a title, search the Tasks data source (Mise AI only) and confirm the match.

## Wayfinding operations

- **Map**: a Tasks row whose Notes line includes `Tags: wayfinder:map`; content holds Notes / Decisions-so-far / Fog.
- **Child ticket**: a Tasks row with `Part of: <map URL>` at the top of content and `Tags: wayfinder:<research|prototype|grilling|task>`.
- **Blocking**: a `Blocked by: <URL>, <URL>` line near the top of content. Unblocked when every listed row is `Done`.
- **Frontier**: open (`To do`), unblocked children of the map, in map order.
- **Claim**: set `Status` = `Doing` (first write of the session).
- **Resolve**: comment the answer, set `Status` = `Done`, append a gist + link to the map's Decisions-so-far.

# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket under `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- Ticket numbers start at `01` in dependency order
- Triage state is recorded as a `Status:` line near the top
- Comments and conversation history are appended under `## Comments`

## Publishing

When a skill says “publish to the issue tracker,” create the corresponding file under `.scratch/<feature-slug>/`.

When a skill says “fetch the relevant ticket,” read the referenced local Markdown file.

## Wayfinding

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/<NN>-<slug>.md`
- Blocking edges: `Blocked by: NN, NN`
- Claim: set `Status: claimed`
- Resolve: append the result under `## Answer` and set `Status: resolved`

# Requirements - Planning Poker Ticket Sizing Game

## What to build
A single-page planning poker web app for agile teams to estimate ticket sizes together. The app should let a facilitator create a sizing session, add participants, reveal votes at the same time, and capture the final estimate for a ticket.

## Users
- Facilitator: creates the session, enters the ticket being estimated, reveals or resets votes, and selects the final estimate.
- Participant: joins by name and selects a sizing card.

## Features
- Create or edit the current ticket with a ticket key, title, and short description.
- Add participants by name.
- Show a planning poker deck with these cards: `0`, `1`, `2`, `3`, `5`, `8`, `13`, `21`, `?`, `coffee`.
- Let each participant select one card.
- Hide participant votes until the facilitator clicks Reveal.
- Reveal all votes together and highlight the most common estimate.
- Show vote statistics after reveal: number of votes, average for numeric cards, highest card, lowest card, and consensus status.
- Let the facilitator choose and save the final estimate.
- Keep a session history of estimated tickets with final estimate and timestamp.
- Reset votes for another round on the same ticket.
- Start a new ticket without losing the session history.
- Persist the current session and history in localStorage so a refresh does not lose work.

## Tech
- Plain HTML, CSS, and JavaScript preferred.
- Single file output preferred: `index.html`.
- Must run in Chrome without a build step.
- Must be deployable to Vercel as a static site.

## Design and UX
- The first screen should be the usable planning poker board, not a marketing landing page.
- Make the app responsive and usable at 375px mobile width.
- Use clear facilitator controls, compact participant rows, and card-style voting buttons.
- Votes should visibly change state when selected.
- Revealed results should be easy to scan during a live sizing meeting.

## Acceptance criteria
- A facilitator can enter a ticket key, title, and description.
- A facilitator can add at least three participants.
- Each participant can select one planning poker card.
- Votes remain hidden before Reveal.
- Clicking Reveal displays every participant vote.
- The app highlights the most common estimate after reveal.
- Numeric vote statistics are calculated correctly while ignoring `?` and `coffee`.
- A final estimate can be saved to session history.
- Reset Votes clears votes without deleting participants or ticket details.
- New Ticket clears ticket details and votes but keeps session history.
- Session state and history survive a page refresh through localStorage.
- The app has no console errors on load or during the main flow.
- The layout is usable on a 375px wide mobile screen.

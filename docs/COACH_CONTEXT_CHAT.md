# Context-aware Coach chat

## Purpose

The Coach currently sees logged training but cannot always know **why** something did not happen. A raw adherence result can therefore be factually correct but contextually misleading. The chat extension lets the user explain a review and, when appropriate, attach explicit time-bounded context.

Example:

- Review sees 8 completed sessions against roughly 14 planned (about 60%).
- User says: "I was travelling, so I deliberately missed those sessions."
- The Coach explains that the original review only saw the schedule/logs.
- If the user also saves the travel dates as structured context, the server recomputes adherence with planned missed travel dates excluded.
- If that changes the evidence, the Coach can withdraw/revise its recommendation.
- Programme changes still require the normal Apply-change approval flow.

## Data model

Conversation/context is stored per profile in:

`DATA_DIR/coach-context/<safe-user-id>.json`

It contains two bounded arrays:

- `messages` — recent user/assistant Coach conversation.
- `contexts` — explicit user-authored, date-bounded facts.

No passkey, session-cookie, push-subscription or other account credential is copied into this store.

## Structured context

A context has:

```json
{
  "reason": "travel",
  "from": "2026-09-01",
  "to": "2026-09-05",
  "affectsAdherence": true,
  "note": "Away interstate"
}
```

`affectsAdherence` defaults to true for travel, illness, work, injury, deload and schedule; it defaults false for equipment and other. The user/UI may explicitly override it.

This is intentionally **not** inferred from normal chat text. If the user says "I was travelling last week", the current chat review can consider the message, but the application should ask whether they want to save a dated travel context before that explanation changes future adherence calculations.

## Adherence adjustment

The helper preserves the original observed rate and adds:

- `explainedMissedSessions`
- `adjustedExpected`
- `adjustedRate`

Only dates that are:

1. inside an explicit saved context marked `affectsAdherence`,
2. scheduled training weekdays under the current weekly plan, and
3. not already represented by a completed workout

are subtracted from the approximate expected-session count.

The scientific review therefore remains transparent: the app can show both "8 / 14 observed" and "8 / 9 adjusted after 5 explained missed sessions" rather than rewriting history.

## Chat behaviour

`POST /api/coach/chat` queues the existing `review` job with trigger `chat`. The payload adds:

- the current message as `userNote`;
- recent conversation as `conversation`;
- overlapping structured facts as `userContext`;
- context-adjusted scientific adherence findings.

The review prompt tells the provider to answer the user's question directly and explain what changed. The existing validator remains the final gate on any proposed plan changes.

## Privacy and lifecycle

- `GET /api/coach/disclosure` gains a `context` data category because Coach messages/context can reach the configured provider during a chat/review.
- `POST /api/coach/forget` removes both Coach job/proposal data and Coach conversation/context.
- Account deletion removes the `coach-context/<user>.json` file through the common training-feature cleanup hook.
- `POST /api/coach/cancel` cancels Coach job/proposal state but intentionally does not erase saved context/history.

## Frontend still required

The compiled backend provides the API and logic, but the eventual UI should add:

- a **Talk to Coach / Add context** action on the review screen;
- chat history and message composer;
- optional reason/date controls when the user wants the explanation retained for future reviews;
- an obvious distinction between observed and adjusted adherence;
- controls to review/delete saved contexts;
- a label/description for the new `context` Coach disclosure category.

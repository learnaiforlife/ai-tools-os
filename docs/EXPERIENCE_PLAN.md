# AIOS 1.5: clarity, session insight and effortless maintenance

## Product contract

AIOS is the local control center across installed AI harnesses. It should answer: what is configured, what actually happened in a session, what deserves attention, and how can I fix it safely? Simple actions lead; advanced controls remain available. No machine-specific paths, credentials or model IDs ship with the app.

## Delivery plan and acceptance

1. **Sessions and context:** bounded, metadata-only local readers for Claude/Codex/Cursor; explicit measured, observed, estimated and unavailable fields; dedicated session detail with initial/first-request context, tools, resource references and usage timeline. No conversation text retained. Native logs are versioned best-effort evidence, never proof of all available resources. Cursor instrumentation is opt-in where transcripts lack tool events.
2. **Usage recommendations:** evaluate the last three eligible sessions per harness and matching project, excluding corrupt/partial/subagent logs. Show observed availability without calls separately from currently configured resources with no recorded calls. Long-idle recommendations include the observation window and evidence; never invent token savings or auto-disable.
3. **Resource workspace:** scope tabs including folder descendants, search, sort, state filters, selection and bulk review; readable Markdown by default; editable source and technical details on demand; persistent detail preference. Primary read/enhance actions, secondary operations in a menu. Preserve transfer, revision and recovery protections.
4. **Simple AI:** default Enhance action uses saved engine/model, with an optional engine dialog. Quick Skill Lab generates a small suite and runs it in one background job, labels generated-test limitations, and preserves advanced A/B/retest. Memory, cleanup and conversion follow progressive disclosure.
5. **Home:** distinct overview, actionable cleanup queue, session/context summaries, bulk skills/memory review with visible file count/token estimate and explicit run action. Chunk large reviews with one bounded overall model budget; retain partial failures honestly.
6. **Official release news:** fetch only maintained official source URLs for detected harnesses and configured model families, cache with timestamps and offline/error states, prompt-based preference editing with visible interpreted filters. Never execute news content or load remote images.
7. **Cleanup:** local duplicate/oversized-memory and inactive-resource candidates, selectable reversible changes, exact preview, conflict detection, recovery links; never equate duplicates with safe deletion.
8. **Verification and delivery:** focused parser/security/behavior tests, full lint/unit/build checks, desktop and packaged UAT in both architectures, visual inspection in light/dark/narrow layouts, review findings resolved/documented, publish beta installers and update Vercel download site with verified hashes/version.

## Evidence boundaries

Claude Tool Search can defer MCP schemas; enabled does not imply full schemas loaded. First API input includes the first prompt and is not pre-prompt startup usage. Codex cumulative billing tokens are not context occupancy. Unknowns stay null. Historical configuration cannot be reconstructed from today's inventory. Missing Cursor tool telemetry cannot establish non-use. Provider sessions outside retained local history are unavailable.

## References checked September 12, 2026

- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/context-window
- https://cursor.com/docs/hooks
- https://learn.chatgpt.com/docs/app-server
- https://github.com/remarkjs/react-markdown

Implementation and validation outcomes will be recorded separately on completion.

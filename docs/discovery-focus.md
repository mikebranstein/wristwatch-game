# Discovery Focus (Required for First Run)

Discovery Orchestrator requires this file before it can invoke Idea Scout.

## Product Scope
- Product name: Wristwatch Revival Simulator
- One-sentence product mission: Deliver a satisfying, authentic-feeling PC simulation where players diagnose, disassemble, clean, repair, source parts for, and reassemble worn mechanical wristwatches in real time.
- In-scope boundaries:
	- Single-player PC simulation focused on mechanical wristwatch restoration.
	- End-to-end repair loop: intake, inspection, teardown, cleaning, fault discovery, part replacement, reassembly, testing, and delivery.
	- Real-time bench workflow with tools, consumables, and careful handling of tiny components.
	- Part acquisition loop: identify failed component, source correct replacement, manage wait time/cost, and verify compatibility.
	- Progression through increasingly complex watch conditions and movement types.
	- Inspired by educational watch-restoration content and craftsmanship storytelling.
- Out-of-scope boundaries:
	- No online PvP, MMO economy, or live-service dependency for core play.
	- No weapon/combat systems or unrelated life-sim mechanics.
	- No full CAD-level engineering simulator for designing brand-new calibers from scratch.
	- No mobile-first UX requirements for initial release.
	- No licensing dependency on specific real-world watch brands for first launch.

## Target Users
- Primary persona:
	- Craft-curious PC sim player (ages 18-45) who enjoys detailed process games and wants a calm, tactile restoration experience.
- Secondary persona(s):
	- Watch enthusiast who wants to practice diagnostic thinking without risking real hardware.
	- Cozy/relaxing sim player who values slow, focused, mastery-based gameplay loops.
	- Content creator/streamer looking for satisfying visual transformations and before/after storytelling.
- Critical jobs-to-be-done:
	- "Help me feel like a real watch restorer by following believable steps from broken to functional."
	- "Help me learn why a watch fails and what part fixes it without overwhelming me with jargon."
	- "Help me complete meaningful restoration jobs in sessions from 20 to 90 minutes."

## Priority Problems (Top 3)
1. Existing repair-themed games often skip technical authenticity, reducing long-term engagement for detail-oriented players.
2. New players are intimidated by dense horology terms and tiny-part complexity, causing early drop-off.
3. Many sim loops lack emotional payoff; players need clear transformation moments (dirty/non-working to clean/running) and ownership over outcomes.

## Success Metrics
- Primary metric (north star):
	- Weekly "Completed Restoration" rate per active player (players who finish at least one full repair loop from intake to delivery).
- Supporting metrics:
	- Tutorial completion rate for first-time players.
	- Median session length and return rate on day 1/day 7/day 30.
	- Percentage of jobs successfully diagnosed without hint escalation.
	- Economy health: average margin per completed job and part-order turnaround satisfaction.
	- Sentiment score from player reviews mentioning "authentic," "relaxing," and "satisfying."
- Time horizon (e.g., 30/60/90 days):
	- 30 days: Validate first-session comprehension and baseline restoration completion.
	- 60 days: Improve retention and reduce frustration in mid-complexity repairs.
	- 90 days: Confirm scalable content cadence (new failure modes/job types) and stable positive review sentiment.

## Constraints and Guardrails
- Compliance/regulatory constraints:
	- Avoid unlicensed use of trademarked watch brand names, logos, and trade dress in launch content.
	- Ensure third-party inspiration stays transformative and does not copy protected scripts, visuals, or proprietary assets.
	- Maintain clear content attribution policy for any educational references.
- Technical constraints:
	- Target mid-range Windows gaming PCs first; keyboard/mouse as primary input.
	- Real-time simulation must remain responsive despite many small interactive parts.
	- Save/load reliability is critical to prevent progress loss during long restorations.
	- Data model must support modular part compatibility across movement families.
- Operational constraints:
	- Small team scope requires phased content rollout and reusable part/system libraries.
	- Prioritize a polished core loop before expanding to advanced complications.
	- QA burden is high due to combinatorial repair states; test plans must focus on high-risk failure chains.

## Signal Sources to Scan
- Support channels:
	- Steam discussion boards, Discord feedback channels, and in-game feedback form.
	- Bug reports tagged by repair stage (teardown, cleaning, sourcing, reassembly, testing).
- Product analytics sources:
	- Funnel telemetry from first intake to first delivered watch.
	- Step-level timing and fail/retry data for each repair phase.
	- Hint usage, undo frequency, and rage-quit indicators during precision tasks.
- Incident/reliability sources:
	- Crash/error logs bucketed by scene and interaction type.
	- Save corruption/restore failure tracking.
	- Performance traces for high-part-count benches.
- Competitor/customer feedback sources:
	- Steam reviews and Reddit threads for craftsmanship/sim games.
	- YouTube comments on watch restoration channels to identify realism expectations.
	- Community wishlists and feature voting from early playtest cohorts.

## Strategic Pillars
1. Authentic Craft Loop: believable restoration workflow that rewards methodical play.
2. Accessible Mastery: gradual learning curve with optional guidance and deeper expert systems.
3. Satisfying Transformation: strong before/after presentation, meaningful progression, and player ownership.

## Initial Discovery Questions
1. Which moments in the repair loop drive the strongest satisfaction: diagnosis, cleaning reveal, successful timing test, or final delivery?
2. What level of realism maximizes fun before complexity turns into friction for mainstream sim players?
3. Which part-sourcing mechanics (catalog search, supplier reputation, shipping delays, counterfeit risk) add strategic depth without slowing pace too much?

## Definition of Useful PM Idea
A useful pm-idea should:
- Be clearly tied to one priority problem and one target persona.
- Include at least one evidence source.
- State expected impact and confidence.

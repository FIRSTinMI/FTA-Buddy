# Writing a troubleshooting tree

Trees live in `shared/troubleshooting/trees/*.json`. One file per tree. The file name is the tree id.
The app bundles every file in that folder, so a new tree shows up in the Guided list with no other code change.

## Shape

```json
{
	"id": "radio",
	"title": "Radio (Vivid VH-109)",
	"summary": "One line shown in the list.",
	"start": "start",
	"nodes": {
		"start": {
			"kind": "question",
			"id": "start",
			"question": "Look at the five lights on the radio. What do you see?",
			"help": "Optional one-liner under the question.",
			"options": [
				{ "label": "PWR off", "next": "power-source" },
				{ "label": "PWR on, SYS solid", "next": "radio-ok" }
			]
		},
		"radio-ok": {
			"kind": "leaf",
			"id": "radio-ok",
			"title": "Radio looks healthy",
			"steps": ["Most likely fix first.", "Then the next thing.", "End with what to swap or who to call."],
			"links": [
				{
					"label": "Radio LED status",
					"url": "https://frc-radio.vivid-hosting.net/overview/led-status-indications"
				}
			],
			"statusLights": [{ "device": "radio", "label": "Radio status lights" }],
			"escalate": true
		}
	}
}
```

Rules the test enforces:

- Ids are lower-case words joined with hyphens. The key in `nodes` must equal the node's `id`.
- `start` must be a question. Every `next` must point at a node in the same tree. Every node must be reachable.
- Every question has at least 2 options.
- Every leaf has 2 to 6 steps. Links are `https://` only.
- `statusLights[].device` must be one of the accordion keys in `StatusLights.svelte` (see `STATUS_LIGHT_DEVICES` in `shared/troubleshooting/types.ts`). It deep-links to `/references/statuslights#<device>`.
- No "AI", "simply", "please", or em dashes in the copy.

## Voice

Short sentences. Plain words. The top question must be answerable by a stressed person on a phone in one glance.
Put the most likely fix first. End each leaf with what to swap or who to escalate to (CSA or FTA). Set `escalate: true` when the last step is a hand-off.

## Steps

1. Copy an existing tree in `shared/troubleshooting/trees/` and edit it, or add a new file and import it in `shared/troubleshooting/index.ts`.
2. Run `bun test src/tests/troubleshooting-trees.test.ts`. Fix what it lists.
3. Open the app at `/troubleshoot/<tree-id>` and click through every branch.
4. Open a PR with the source you used for each new fact in the description.

import { describe, expect, test } from "bun:test";
import {
	buildSlackChunks,
	buildThreadChunk,
	slackPermalink,
	sourceKey,
	type SlackChannelContext,
	type SlackMessage,
} from "../util/troubleshoot/slack-chunks";

const ctx: SlackChannelContext = {
	teamId: "T0FIM",
	teamDomain: "firstinmichigan",
	channelId: "C0CSA",
	channelName: "csa-help",
};

const longText = "Robot on the red 2 station drops comms every time auto starts, radio lights stay solid.";

const history: SlackMessage[] = [
	// Thread parent with two replies
	{ ts: "1725000000.000100", text: longText, user: "U1", thread_ts: "1725000000.000100", reply_count: 2 },
	// Short standalone, skipped
	{ ts: "1725000100.000200", text: "thanks all", user: "U2" },
	// Long standalone, kept
	{
		ts: "1725000200.000300",
		text: "PSA: the 2026 VH-109 firmware update fixes the 5GHz drop after brownout, flash every team radio at load-in.",
		user: "U3",
	},
	// Bot with no replies, skipped
	{
		ts: "1725000300.000400",
		text: "New ticket opened for team 254 at station blue 1 with a long enough body to pass the length rule.",
		bot_id: "B1",
		subtype: "bot_message",
		reply_count: 0,
	},
	// Bot with a human reply, kept
	{
		ts: "1725000400.000500",
		text: "Nexus request: team 1234 needs a CSA at their pit for a comms issue.",
		bot_id: "B2",
		subtype: "bot_message",
		reply_count: 1,
	},
	// Broadcast reply, skipped (belongs to its thread)
	{
		ts: "1725000500.000600",
		text: "Also broadcasting this reply into the channel for visibility everyone.",
		user: "U4",
		thread_ts: "1725000000.000100",
		subtype: "thread_broadcast",
	},
	// Join event, skipped
	{ ts: "1725000600.000700", text: "<@U9> has joined the channel", user: "U9", subtype: "channel_join" },
];

const replies = new Map<string, SlackMessage[]>([
	[
		"1725000000.000100",
		[
			{
				ts: "1725000010.000000",
				text: "Check the radio power, is the RSL steady?",
				user: "U5",
				thread_ts: "1725000000.000100",
			},
			{
				ts: "1725000020.000000",
				text: "It was a loose PoE cable, fixed.",
				user: "U1",
				thread_ts: "1725000000.000100",
			},
		],
	],
	["1725000400.000500", [{ ts: "1725000410.000000", text: "On my way", user: "U6", thread_ts: "1725000400.000500" }]],
]);

describe("buildSlackChunks", () => {
	const chunks = buildSlackChunks(ctx, history, replies);

	test("keeps threads, long standalones, and bot posts with human replies", () => {
		expect(chunks.map((c) => c.source_key)).toEqual([
			"slack:T0FIM:C0CSA:1725000000.000100",
			"slack:T0FIM:C0CSA:1725000200.000300",
			"slack:T0FIM:C0CSA:1725000400.000500",
		]);
	});

	test("thread chunk has title, ordered replies and permalink", () => {
		const t = chunks[0];
		expect(t.source).toBe("slack");
		expect(t.title).toBe(`#csa-help: ${longText.slice(0, 80)}`);
		expect(t.body).toBe(
			`${longText}\nReply: Check the radio power, is the RSL steady?\nReply: It was a loose PoE cable, fixed.`,
		);
		expect(t.url).toBe("https://firstinmichigan.slack.com/archives/C0CSA/p1725000000000100");
		expect(t.source_date?.getTime()).toBe(1725000000000);
	});

	test("title is cut at 80 characters", () => {
		expect(chunks[1].title.length).toBeLessThanOrEqual("#csa-help: ".length + 80);
	});

	test("bot parent with a human reply is kept with the reply", () => {
		expect(chunks[2].body).toContain("Reply: On my way");
	});
});

describe("buildThreadChunk edge cases", () => {
	test("url is null when the team domain is unknown", () => {
		const c = buildThreadChunk({ ...ctx, teamDomain: null }, { parent: history[2], replies: [] });
		expect(c?.url).toBeNull();
	});

	test("short standalone with a reply is kept", () => {
		const c = buildThreadChunk(ctx, {
			parent: { ts: "1.000000", text: "rio wont boot", user: "U1", reply_count: 1 },
			replies: [{ ts: "2.000000", text: "reimage it", user: "U2" }],
		});
		expect(c?.body).toBe("rio wont boot\nReply: reimage it");
	});

	test("bot parent with only bot replies is skipped", () => {
		const c = buildThreadChunk(ctx, {
			parent: { ts: "1.000000", text: longText, bot_id: "B1", subtype: "bot_message", reply_count: 1 },
			replies: [{ ts: "2.000000", text: "status changed", bot_id: "B1", subtype: "bot_message" }],
		});
		expect(c).toBeNull();
	});

	test("empty replies are dropped from the body", () => {
		const c = buildThreadChunk(ctx, {
			parent: { ts: "1.000000", text: longText, user: "U1", reply_count: 2 },
			replies: [
				{ ts: "2.000000", text: "", user: "U2" },
				{ ts: "3.000000", text: "swap the breaker", user: "U3" },
			],
		});
		expect(c?.body).toBe(`${longText}\nReply: swap the breaker`);
	});
});

describe("helpers", () => {
	test("sourceKey and permalink formats", () => {
		expect(sourceKey("T1", "C1", "12.34")).toBe("slack:T1:C1:12.34");
		expect(slackPermalink("acme", "C1", "1725000000.000100")).toBe(
			"https://acme.slack.com/archives/C1/p1725000000000100",
		);
		expect(slackPermalink(null, "C1", "1.2")).toBeNull();
	});
});

describe("image captions", () => {
	test("a caption is appended to the message text", () => {
		const c = buildThreadChunk(ctx, {
			parent: {
				ts: "1.000000",
				text: "what is this code",
				user: "U1",
				reply_count: 1,
				files: [{ id: "F1", mimetype: "image/png" }],
				captions: ["Driver Station diagnostics tab showing ERROR 44002 No robot code."],
			},
			replies: [{ ts: "2.000000", text: "deploy is failing, check the rio console", user: "U2" }],
		});
		expect(c?.body).toBe(
			"what is this code\n[Image: Driver Station diagnostics tab showing ERROR 44002 No robot code.]\n" +
				"Reply: deploy is failing, check the rio console",
		);
	});

	test("an image-only standalone is kept when the caption is long enough", () => {
		const c = buildThreadChunk(ctx, {
			parent: {
				ts: "1.000000",
				user: "U1",
				subtype: "file_share",
				files: [{ id: "F2", mimetype: "image/jpeg" }],
				captions: ["Radio with a solid red power LED and no 2.4GHz or 6GHz light, PoE cable plugged in."],
			},
			replies: [],
		});
		expect(c?.body).toBe(
			"[Image: Radio with a solid red power LED and no 2.4GHz or 6GHz light, PoE cable plugged in.]",
		);
	});

	test("an image-only standalone with no readable caption is skipped", () => {
		const c = buildThreadChunk(ctx, {
			parent: { ts: "1.000000", user: "U1", subtype: "file_share", files: [{ id: "F3", mimetype: "image/png" }] },
			replies: [],
		});
		expect(c).toBeNull();
	});

	test("an image-only reply is kept in the body", () => {
		const c = buildThreadChunk(ctx, {
			parent: { ts: "1.000000", text: longText, user: "U1", reply_count: 1 },
			replies: [
				{
					ts: "2.000000",
					user: "U2",
					files: [{ id: "F4", mimetype: "image/png" }],
					captions: ["Phoenix Tuner device list with one Talon FX reporting a duplicate CAN ID."],
				},
			],
		});
		expect(c?.body).toBe(
			`${longText}\nReply: [Image: Phoenix Tuner device list with one Talon FX reporting a duplicate CAN ID.]`,
		);
	});
});

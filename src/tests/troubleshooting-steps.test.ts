import { describe, expect, test } from "bun:test";
import { parseStep, parseSteps } from "../../shared/troubleshooting/steps";

describe("parseStep", () => {
	test("plain sentence is a do step", () => {
		expect(parseStep("Power cycle the robot.")).toEqual([{ kind: "do", text: "Power cycle the robot." }]);
	});
	test("leading If becomes a check with a yes outcome", () => {
		expect(parseStep("If PWR stays off with known good 12 V at the radio, swap the radio.")).toEqual([
			{ kind: "check", text: "PWR stays off with known good 12 V at the radio?", yes: "Swap the radio.", no: "Fixed. Stop here." },
		]);
	});
	test("Still X: Y becomes a check", () => {
		expect(parseStep("Still dark: swap the radio, program it at the kiosk.")).toEqual([
			{ kind: "check", text: "Still dark?", yes: "Swap the radio, program it at the kiosk.", no: "Fixed. Stop here." },
		]);
	});
	test("action then If splits into do + check", () => {
		expect(parseStep("Power on. If it still flashes, reimage the card on a laptop.")).toEqual([
			{ kind: "do", text: "Power on." },
			{ kind: "check", text: "It still flashes?", yes: "Reimage the card on a laptop.", no: "Fixed. Stop here." },
		]);
	});
	test("a plain condition keeps No as continue", () => {
		expect(parseStep("If a NEO is attached, the motor type is wrong.")).toEqual([
			{ kind: "check", text: "A NEO is attached?", yes: "The motor type is wrong.", no: undefined },
		]);
	});
	test("objects pass through parseSteps", () => {
		const check = { kind: "check" as const, text: "Fixed?", yes: "Done." };
		expect(parseSteps(["Do it.", check])).toEqual([{ kind: "do", text: "Do it." }, check]);
	});
});

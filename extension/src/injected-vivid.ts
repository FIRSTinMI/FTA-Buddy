import { trpc, updateValues } from "./injected-trpc";

let url = document.getElementById("fta-buddy")?.dataset.host;
let cloud = document.getElementById("fta-buddy")?.dataset.cloud;
let useDev = document.getElementById("fta-buddy")?.dataset.useDev;
let eventCode = document.getElementById("fta-buddy")?.dataset.event;
let eventToken = document.getElementById("fta-buddy")?.dataset.eventToken;
let extensionId = document.getElementById("fta-buddy")?.dataset.extensionId;

if (!url || !cloud || !eventCode || !eventToken) {
	throw new Error("Missing data");
} else {
	updateValues({
		cloud: cloud === "true",
		useDev: useDev === "true",
		id: "",
		event: eventCode,
		url: url,
		eventToken: eventToken,
		extensionId,
	});
}

const completedTeams: string[] = [];

/**
 * A programmed radio has to be obvious from across the pit, so the whole page
 * turns green behind the kiosk's own card rather than just the heading.
 *
 * The kiosk (ghcr.io/vivid-hosting/frc-radio-kiosk) is a Next.js app whose page
 * background is Tailwind's bg-background on <body>; <main> and the wrapper it
 * renders into are transparent, and the status card is a shadcn Card carrying
 * its own bg-card. So body is the only element to repaint - !important to beat
 * the utility class - and the card still reads as a card on a green page. Do not
 * widen this to main's children: the 2.4GHz warning is one of them.
 *
 * The "Success!" heading sits inside that white card, not on the page, so the
 * background is free to be a full green-500 without costing the heading any
 * contrast.
 *
 * The green goes on <html> and <body> is made transparent, not the other way
 * round. The kiosk's own confetti is a canvas at z-index -10, and a negative
 * z-index layer paints above the root background but below body's own
 * background. A green body therefore hid the confetti completely. The kiosk's
 * confetti is also the canvas-confetti default rainbow, which includes a green
 * that disappears on this page, so it is hidden and replaced with a gold burst
 * of our own drawn above everything.
 */
const SUCCESS_CLASS = "fta-buddy-radio-success";
const SUCCESS_STYLE_ID = "fta-buddy-radio-success-style";

function installSuccessStyle() {
	if (document.getElementById(SUCCESS_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = SUCCESS_STYLE_ID;
	style.textContent = `html.${SUCCESS_CLASS} {
	background-color: #22c55e !important;
}
html.${SUCCESS_CLASS} body {
	background-color: transparent !important;
}
html.${SUCCESS_CLASS} canvas[class~="z-[-10]"] {
	display: none !important;
}`;
	document.head.appendChild(style);
}

const GOLD = ["#ffd700", "#ffc400", "#f5b301", "#ffe27a", "#daa520"];

/** Two gold cannons from the bottom corners, drawn above the kiosk's card. */
function fireGoldConfetti() {
	const canvas = document.createElement("canvas");
	canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647";
	document.body.appendChild(canvas);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		canvas.remove();
		return;
	}
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;

	const particles = Array.from({ length: 200 }, (_, i) => {
		const side = i % 2 === 0 ? 1 : -1;
		return {
			x: side === 1 ? 0 : canvas.width,
			y: canvas.height * 0.8,
			vx: side * (6 + Math.random() * 12),
			vy: -(10 + Math.random() * 14),
			color: GOLD[Math.floor(Math.random() * GOLD.length)],
			w: 8 + Math.random() * 8,
			h: 10 + Math.random() * 8,
			rot: Math.random() * Math.PI * 2,
			rotV: (Math.random() - 0.5) * 0.3,
		};
	});

	let tick = 0;
	function animate() {
		ctx!.clearRect(0, 0, canvas.width, canvas.height);
		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.vy += 0.4;
			p.vx *= 0.99;
			p.rot += p.rotV;
			ctx!.save();
			ctx!.translate(p.x, p.y);
			ctx!.rotate(p.rot);
			ctx!.fillStyle = p.color;
			ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
			// A dark gold edge keeps each piece distinct against the green.
			ctx!.strokeStyle = "#8a6400";
			ctx!.lineWidth = 1.5;
			ctx!.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
			ctx!.restore();
		}
		if (++tick < 240) requestAnimationFrame(animate);
		else canvas.remove();
	}
	requestAnimationFrame(animate);
}

let successShown = false;

/** Green while a radio reads ACTIVE, back to normal as soon as the kiosk resets. */
function setSuccessBackground(on: boolean) {
	if (on) installSuccessStyle();
	document.documentElement.classList.toggle(SUCCESS_CLASS, on);
	if (on && !successShown) fireGoldConfetti();
	successShown = on;
}

/**
 * The kiosk's /connect page puts six things in front of a student before the
 * Program button: the radio's current team, a warning that the radio is not
 * configured for this event (true of every radio at every new event, so it only
 * alarms people), the firmware version, an instruction sentence, the field and
 * "Numeric only". Students stall on the warning.
 *
 * This cuts it to two: the team number, large, and a large button that names
 * the team it will program. The kiosk (v2.0.1) already prefills the field with
 * the radio's current team, so the usual case is check the number, press the
 * button. With no team on the radio the field is empty and focused, and the
 * button stays disabled until a number is in it. The firmware line and reflash
 * link stay, small, under the button for the FTA.
 *
 * Markup, from the v2.0.1 bundle: a flex column holding [info div (current
 * team <p>, warning Alert, firmware <p>), instruction <p>, <form>]. The form is
 * react-hook-form over a shadcn FormItem: <label>, input[type=tel][name=team],
 * description <p>, message <p>, then the submit <button>. Only styling and the
 * button's text and disabled state change; React still owns the value.
 */
const CONNECT_CLASS = "fta-buddy-connect";
const CONNECT_STYLE_ID = "fta-buddy-connect-style";

function installConnectStyle() {
	if (document.getElementById(CONNECT_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = CONNECT_STYLE_ID;
	style.textContent = `html.${CONNECT_CLASS} [data-fb-connect="container"] {
	width: 32rem;
	max-width: calc(100vw - 2rem);
}
html.${CONNECT_CLASS} [data-fb-connect="info"] {
	order: 10;
	font-size: 0.8rem;
	color: hsl(var(--muted-foreground));
	text-align: center;
}
html.${CONNECT_CLASS} [data-fb-connect="info"] > :not([data-fb-connect="firmware"]),
html.${CONNECT_CLASS} [data-fb-connect="hide"] {
	display: none !important;
}
html.${CONNECT_CLASS} [data-fb-connect="label"] {
	font-size: 1.5rem;
	text-align: center;
	display: block;
}
html.${CONNECT_CLASS} [data-fb-connect="input"] {
	height: 6rem;
	font-size: 4rem;
	font-weight: 700;
	text-align: center;
	letter-spacing: 0.05em;
}
html.${CONNECT_CLASS} [data-fb-connect="button"] {
	height: 5rem;
	font-size: 2rem;
	font-weight: 700;
}`;
	document.head.appendChild(style);
}

function mark(el: Element | null | undefined, role: string) {
	if (el && (el as HTMLElement).dataset.fbConnect !== role) (el as HTMLElement).dataset.fbConnect = role;
}

/** Set a React-controlled input's value so react-hook-form sees the change. */
function setReactInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function simplifyConnectPage() {
	const input = document.querySelector('main form input[name="team"]') as HTMLInputElement | null;
	const form = input?.closest("form");
	const button = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
	const container = form?.parentElement;
	if (!input || !form || !button || !container) {
		document.documentElement.classList.remove(CONNECT_CLASS);
		return;
	}

	installConnectStyle();
	document.documentElement.classList.add(CONNECT_CLASS);

	mark(container, "container");
	const [info, instruction] = Array.from(container.children);
	if (info !== form) {
		mark(info, "info");
		mark(info.querySelector("samp")?.closest("p"), "firmware");
	}
	if (instruction && instruction !== form) mark(instruction, "hide");

	const item = input.closest("form > div");
	mark(item?.querySelector("label"), "label");
	mark(input, "input");
	mark(button, "button");
	// "Numeric only" is the one muted <p> before any validation message.
	const description = input.parentElement?.querySelector("p.text-muted-foreground") ?? item?.querySelector("p.text-muted-foreground");
	mark(description, "hide");

	const label = item?.querySelector("label");
	if (label && label.textContent !== "Team number") label.textContent = "Team number";

	if (!input.dataset.fbConnectInit) {
		input.dataset.fbConnectInit = "1";
		// A blank radio can report team 0; that is not a team to confirm.
		if (input.value === "0") setReactInputValue(input, "");
		if (input.value === "") input.focus();
		// Typing a different team replaces the detected one instead of appending.
		input.addEventListener("focus", () => input.select());
	}

	const team = input.value.trim();
	const valid = /^\d{1,5}$/.test(team) && Number(team) > 0;
	const text = valid ? `Program team ${team}` : "Program";
	if (button.textContent !== text) button.textContent = text;
	if (button.disabled === valid) button.disabled = !valid;
}

function scrapeTeamList() {
	const div = document.querySelector("div.relative.overflow-hidden > div > div > div");
	if (!div) return;

	const array = Array.from(div.children);

	const programmedTeams = [];

	for (let i = 3; i < array.length; i += 4) {
		if (array[i + 2] && array[i + 2].textContent === "Programmed") {
			programmedTeams.push(array[i].textContent as string);
		}
	}

	return programmedTeams;
}

function scrapeProgrammingPage() {
	const statusDiv = document.querySelector(
		"div.p-6.pt-0.flex.flex-col.gap-y-4 > div:nth-child(2) > p.text-sm.text-muted-foreground",
	) as HTMLParagraphElement;
	const titleDiv = document.querySelector(
		"body > main > div:nth-child(1) > div > div > div > p",
	) as HTMLParagraphElement;
	if (!statusDiv || !titleDiv) return;
	if (statusDiv.innerText === "ACTIVE") {
		titleDiv.style.marginTop = "0.5rem";
		titleDiv.style.fontSize = "3rem";
		titleDiv.style.fontWeight = "bold";
		titleDiv.innerText = "Success!";
		titleDiv.style.color = "green";
		setSuccessBackground(true);
		const team = window.location.search.split("=")[1];

		return team;
	} else {
		setSuccessBackground(false);
	}
}

setInterval(async () => {
	const teamsToSend: {
		team: string;
		key: "inspected" | "present" | "radioProgrammed";
		value: boolean;
	}[] = [];

	if (window.location.pathname === "/admin") {
		const programmedTeams = scrapeTeamList();
		if (programmedTeams) {
			for (const team of programmedTeams) {
				if (!completedTeams.includes(team)) {
					completedTeams.push(team);
					teamsToSend.push({ team, key: "radioProgrammed", value: true });
				}
			}
		}
	} else if (window.location.pathname === "/status") {
		const team = scrapeProgrammingPage();
		if (team) {
			teamsToSend.push({ team, key: "radioProgrammed", value: true });
		}
	}

	if (teamsToSend.length > 0) await trpc.checklist.update.mutate(teamsToSend);
}, 1000);

setInterval(async () => {
	if (window.location.pathname === "/connect") simplifyConnectPage();
	else document.documentElement.classList.remove(CONNECT_CLASS);

	if (window.location.pathname === "/status") {
		scrapeProgrammingPage();
	} else {
		// The kiosk is a single-page app, so leaving /status never reloads the
		// document and would otherwise leave the page green.
		setSuccessBackground(false);
	}
}, 200); // More frequent to make the interface update faster

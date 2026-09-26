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

const DISCONNECT_ID = "fta-buddy-disconnect";

/** Green while a radio reads ACTIVE, back to normal as soon as the kiosk resets. */
function setSuccessBackground(on: boolean) {
	if (!on) document.getElementById(DISCONNECT_ID)?.remove();
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
		form.addEventListener("submit", () => {
			lastProgrammedTeam = input.value.trim() || null;
		});
	}

	const team = input.value.trim();
	const valid = /^\d{1,5}$/.test(team) && Number(team) > 0;
	const text = valid ? `Program team ${team}` : "Program";
	if (button.textContent !== text) button.textContent = text;
	if (button.disabled === valid) button.disabled = !valid;
}

/**
 * While the radio programs, the kiosk's /status card lists Team, Status,
 * Version and WPA Key with red crosses next to everything not done yet, and a
 * small spinner in the corner. Students read the red crosses as failure. Until
 * the radio is done, the card's header is swapped for one panel: a large
 * spinner, "Programming", the team and "Do not unplug". The checks stay under
 * it, with the pending ones as a grey pulsing dot instead of a red cross. The
 * kiosk's header comes back the moment it is done, under the green page.
 *
 * The panel is inserted into the kiosk's Card and the header is hidden with
 * CSS rather than removed, so React's nodes are never touched.
 */
const PROGRAMMING_CLASS = "fta-buddy-programming";
const PROGRAMMING_PANEL_ID = "fta-buddy-programming-panel";
const KIOSK_STYLE_ID = "fta-buddy-kiosk-style";

function installKioskStyle() {
	if (document.getElementById(KIOSK_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = KIOSK_STYLE_ID;
	style.textContent = `@keyframes fta-buddy-spin {
	to { transform: rotate(360deg); }
}
.fta-buddy-panel {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	padding: 1.25rem 1.5rem;
	text-align: center;
}
.fta-buddy-spinner {
	width: 3.5rem;
	height: 3.5rem;
	border-radius: 9999px;
	border: 0.45rem solid hsl(var(--muted));
	border-top-color: #2563eb;
	animation: fta-buddy-spin 0.9s linear infinite;
	margin-bottom: 0.5rem;
}
.fta-buddy-panel-title {
	font-size: 2rem;
	font-weight: 700;
	line-height: 1.1;
}
.fta-buddy-panel-team {
	font-size: 1.5rem;
	font-weight: 600;
}
.fta-buddy-panel-warn {
	margin-top: 0.25rem;
	font-size: 1.25rem;
	font-weight: 700;
	color: #b91c1c;
}
html.${PROGRAMMING_CLASS} [data-fb-card] > :first-child {
	display: none !important;
}
html.${PROGRAMMING_CLASS} [data-fb-card] #${PROGRAMMING_PANEL_ID} {
	padding-bottom: 1rem;
}
@keyframes fta-buddy-pulse {
	50% { opacity: 0.3; }
}
html.${PROGRAMMING_CLASS} [data-fb-card] span.text-red-600 {
	color: #9ca3af !important;
}
html.${PROGRAMMING_CLASS} [data-fb-card] span.text-red-600 > svg {
	display: none;
}
html.${PROGRAMMING_CLASS} [data-fb-card] span.text-red-600::before {
	content: "";
	display: inline-block;
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 9999px;
	background: currentColor;
	animation: fta-buddy-pulse 1.2s ease-in-out infinite;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="container"] {
	width: 32rem;
	max-width: calc(100vw - 2rem);
	align-items: stretch;
	text-align: center;
	gap: 1.5rem;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="title"] {
	font-size: 2.5rem;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="sentence"] {
	display: none !important;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="buttons"] {
	flex-direction: column-reverse;
	gap: 1rem;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="buttons"] > a,
html.${OUTOFDATE_CLASS} [data-fb-ood="buttons"] button {
	width: 100%;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="upgrade"] {
	height: 5rem;
	font-size: 2rem;
	font-weight: 700;
}
html.${OUTOFDATE_CLASS} [data-fb-ood="back"] {
	height: 3rem;
	font-size: 1.1rem;
}
.fta-buddy-versions {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 1.25rem;
	font-family: ui-monospace, monospace;
	font-size: 2.5rem;
	font-weight: 700;
}
.fta-buddy-versions-old {
	color: #b91c1c;
}
.fta-buddy-versions-label {
	font-family: ui-sans-serif, system-ui, sans-serif;
	font-size: 0.9rem;
	font-weight: 500;
	color: hsl(var(--muted-foreground));
	display: block;
}`;
	document.head.appendChild(style);
}

function programmingPanel(team: string | null): HTMLElement {
	const panel = document.createElement("div");
	panel.className = "fta-buddy-panel";
	const spinner = document.createElement("div");
	spinner.className = "fta-buddy-spinner";
	const title = document.createElement("div");
	title.className = "fta-buddy-panel-title";
	title.textContent = "Programming";
	panel.append(spinner, title);
	if (team) {
		const teamEl = document.createElement("div");
		teamEl.className = "fta-buddy-panel-team";
		teamEl.textContent = `Team ${team}`;
		panel.append(teamEl);
	}
	const warn = document.createElement("div");
	warn.className = "fta-buddy-panel-warn";
	warn.textContent = "Do not unplug";
	panel.append(warn);
	return panel;
}

/** Programming panel over the /status card while the radio is not done yet. */
function setProgrammingPanel(card: HTMLElement | null, on: boolean) {
	document.documentElement.classList.toggle(PROGRAMMING_CLASS, on && !!card);
	const existing = document.getElementById(PROGRAMMING_PANEL_ID);
	if (!on || !card) {
		existing?.remove();
		return;
	}
	installKioskStyle();
	card.dataset.fbCard = "1";
	if (existing?.parentElement === card) return;
	existing?.remove();
	const panel = programmingPanel(new URLSearchParams(window.location.search).get("team"));
	panel.id = PROGRAMMING_PANEL_ID;
	// After the kiosk's header, which is hidden; its Team / Status / WPA Key
	// checks stay visible underneath, pending ones as a grey pulsing dot.
	card.firstElementChild?.insertAdjacentElement("afterend", panel);
}

/**
 * The same panel on /connect for the second or two between pressing Program
 * and the kiosk moving to /status, where the kiosk shows only a bare spinner.
 */
const CONNECT_PROGRAMMING_ID = "fta-buddy-connect-programming";
let lastProgrammedTeam: string | null = null;

function showConnectProgramming() {
	const main = document.querySelector("main");
	const form = main?.querySelector("form");
	const spinner = main?.querySelector(":scope > svg.animate-spin, :scope > div > svg.animate-spin") as SVGElement | null;
	const existing = document.getElementById(CONNECT_PROGRAMMING_ID);
	if (!main || form || !spinner || !lastProgrammedTeam) {
		existing?.remove();
		if (spinner) spinner.style.removeProperty("display");
		return;
	}
	if (existing) return;
	installKioskStyle();
	spinner.style.display = "none";
	const panel = programmingPanel(lastProgrammedTeam);
	panel.id = CONNECT_PROGRAMMING_ID;
	spinner.insertAdjacentElement("afterend", panel);
}

/**
 * /connect/outofdate is one sentence ("Firmware must be updated from version
 * X to a minimum version of Y to proceed") and two small buttons, Back first.
 * It becomes the two versions, large, old one red, and one large "Update
 * firmware" button with Back small underneath. The page is a server component
 * with no client state, so rewriting its button text is safe.
 */
const OUTOFDATE_CLASS = "fta-buddy-outofdate";

function simplifyOutOfDatePage() {
	const title =
		document.querySelector('main h1[data-fb-ood="title"]') ??
		Array.from(document.querySelectorAll("main h1")).find((h) => h.textContent?.includes("Out of Date"));
	const container = title?.parentElement;
	const sentence = container?.querySelector("p");
	const samps = sentence ? Array.from(sentence.querySelectorAll("samp")) : [];
	const buttons = container?.querySelector("div.flex");
	const back = buttons?.querySelector('a[href="/connect"] button') as HTMLButtonElement | null;
	const upgrade = buttons?.querySelector('a[href="/upgrade"] button') as HTMLButtonElement | null;
	if (!title || !container || !sentence || samps.length < 2 || !buttons || !back || !upgrade) {
		document.documentElement.classList.remove(OUTOFDATE_CLASS);
		return;
	}
	installKioskStyle();
	document.documentElement.classList.add(OUTOFDATE_CLASS);
	mark2(container, "container");
	mark2(title, "title");
	mark2(sentence, "sentence");
	mark2(buttons, "buttons");
	mark2(back, "back");
	mark2(upgrade, "upgrade");
	if (title.textContent !== "Firmware update") title.textContent = "Firmware update";
	if (upgrade.textContent !== "Update firmware") upgrade.textContent = "Update firmware";
	if (back.textContent !== "Back") back.textContent = "Back";
	if (!container.querySelector(".fta-buddy-versions")) {
		const [from, to] = samps.map((el) => el.textContent ?? "");
		const versions = document.createElement("div");
		versions.className = "fta-buddy-versions";
		const cell = (label: string, value: string, cls: string) => {
			const el = document.createElement("div");
			el.className = cls;
			const l = document.createElement("span");
			l.className = "fta-buddy-versions-label";
			l.textContent = label;
			el.append(l, value);
			return el;
		};
		const arrow = document.createElement("div");
		arrow.textContent = "\u2192";
		versions.append(cell("Radio", from, "fta-buddy-versions-old"), arrow, cell("Required", to, ""));
		sentence.insertAdjacentElement("afterend", versions);
	}
}

function mark2(el: Element, role: string) {
	if ((el as HTMLElement).dataset.fbOod !== role) (el as HTMLElement).dataset.fbOod = role;
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
	const card = statusDiv?.closest("div.rounded-lg.border") as HTMLElement | null;
	// The Card's title. Not a path from <main>: the "No team keys are loaded"
	// alert, when shown, is main's first child and shifts every nth-child.
	const titleDiv = card?.querySelector(".text-2xl") as HTMLParagraphElement | null;
	if (!statusDiv || !titleDiv) {
		setProgrammingPanel(null, false);
		return;
	}
	// The kiosk calls it done only when team, status and WPA key all tick green.
	// Right after Program the radio can still read ACTIVE on its old settings,
	// so ACTIVE alone would flash the success page early.
	const done = statusDiv.innerText === "ACTIVE" && !card?.querySelector(".text-red-600");
	setProgrammingPanel(card, !done);
	if (done) {
		titleDiv.style.marginTop = "0.5rem";
		titleDiv.style.fontSize = "3rem";
		titleDiv.style.fontWeight = "bold";
		titleDiv.innerText = "Success!";
		titleDiv.style.color = "green";
		if (!document.getElementById(DISCONNECT_ID)) {
			const line = document.createElement("p");
			line.id = DISCONNECT_ID;
			line.textContent = "You may now disconnect the radio";
			line.style.cssText = "font-size:1.125rem;font-weight:600;margin-top:0.25rem";
			titleDiv.insertAdjacentElement("afterend", line);
		}
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
	if (window.location.pathname === "/connect") {
		simplifyConnectPage();
		showConnectProgramming();
	} else document.documentElement.classList.remove(CONNECT_CLASS);

	if (window.location.pathname === "/connect/outofdate") simplifyOutOfDatePage();
	else document.documentElement.classList.remove(OUTOFDATE_CLASS);

	if (window.location.pathname === "/status") {
		scrapeProgrammingPage();
	} else {
		// The kiosk is a single-page app, so leaving /status never reloads the
		// document and would otherwise leave the page green.
		setSuccessBackground(false);
		setProgrammingPanel(null, false);
	}
}, 200); // More frequent to make the interface update faster

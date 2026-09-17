/**
 * The page a team opens on their own laptop.
 *
 * Written as one server-rendered file with no build step, no framework and no
 * JavaScript required to submit, because the whole point is that it works on a
 * borrowed Windows laptop in a pit with bad wifi. A plain multipart form post is
 * the most reliable upload path a browser has.
 */

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const STYLE = `
:root { color-scheme: dark; --bg:#0f1115; --card:#171a21; --line:#272b35; --text:#e8eaed; --dim:#9aa0ac; --accent:#f59e0b; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
.wrap { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
h1 { font-size:1.5rem; margin:0 0 .25rem; }
h2 { font-size:1.1rem; margin:1.5rem 0 .5rem; }
p.lede { color:var(--dim); margin:0 0 1.5rem; }
.card { background:var(--card); border:1px solid var(--line); border-radius:.75rem; padding:1.25rem; margin-bottom:1rem; }
label { display:block; font-weight:600; margin:1rem 0 .35rem; }
label:first-child { margin-top:0; }
.hint { font-weight:400; color:var(--dim); font-size:.875rem; }
input[type=text], input[type=number], textarea, input[type=file] {
  width:100%; padding:.6rem .7rem; background:#0c0e12; color:var(--text);
  border:1px solid var(--line); border-radius:.5rem; font:inherit;
}
textarea { min-height:5.5rem; resize:vertical; }
button { margin-top:1.5rem; width:100%; padding:.8rem; font:inherit; font-weight:700;
  background:var(--accent); color:#1a1205; border:0; border-radius:.5rem; cursor:pointer; }
button:hover { filter:brightness(1.08); }
code { background:#0c0e12; border:1px solid var(--line); border-radius:.25rem; padding:.1rem .3rem; }
.code { font:700 2rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.1em; color:var(--accent); }
ul { padding-left:1.25rem; }
li { margin:.25rem 0; }
.warn { border-left:3px solid var(--accent); padding-left:.75rem; color:var(--dim); }
.ok { color:#4ade80; }
a { color:var(--accent); }
footer { color:var(--dim); font-size:.8125rem; margin-top:2rem; }
`;

function page(title: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}

export interface PortalFormOptions {
	/** Prefilled event code, from `?event=` or the link a CSA handed over. */
	eventCode?: string;
	eventName?: string;
	/** Shown above the form when a submission was rejected. */
	error?: string;
}

export function portalFormPage(options: PortalFormOptions): string {
	const eventLine = options.eventName
		? `<p class="lede">Uploading to <strong>${escapeHtml(options.eventName)}</strong>.</p>`
		: `<p class="lede">Give your logs to the CSA team. They see them straight away.</p>`;
	const error = options.error ? `<div class="card warn">${escapeHtml(options.error)}</div>` : "";

	return page(
		"Send logs to the CSA",
		`
<h1>Send your logs to the CSA</h1>
${eventLine}
${error}
<form class="card" method="post" action="/upload" enctype="multipart/form-data">
  <input type="hidden" name="event" value="${escapeHtml(options.eventCode ?? "")}">
  ${
		options.eventCode
			? ""
			: `<label>Event code <span class="hint">On the pit board, for example 2026miket. Leave blank if you do not know it.</span>
         <input type="text" name="event" autocapitalize="off" autocomplete="off" spellcheck="false"></label>`
  }
  <label>Team number
    <input type="number" name="team" min="1" max="99999" inputmode="numeric">
  </label>
  <label>Your name <span class="hint">So the CSA knows who to come and find.</span>
    <input type="text" name="uploader" maxlength="120" autocomplete="name">
  </label>
  <label>What is going wrong? <span class="hint">A sentence is plenty. When did it start, what does the robot do?</span>
    <textarea name="notes" maxlength="4000" placeholder="Robot drops out about 30 seconds into every match. Radio lights look normal."></textarea>
  </label>
  <label>Files
    <input type="file" name="files" multiple
      accept=".wpilog,.dslog,.dsevents,.log,.txt,.zip,.llsupport,.json">
  </label>
  <button type="submit">Upload</button>
</form>

<div class="card">
  <h2>What to send</h2>
  <ul>
    <li><strong>Driver Station logs</strong> (<code>.dslog</code> and <code>.dsevents</code>) from the laptop that drives.
      In the Driver Station, open the gear tab and press the folder button, or look in
      <code>C:\\Users\\Public\\Documents\\FRC\\Log Files</code>. Send both files for the session.</li>
    <li><strong>Robot data log</strong> (<code>.wpilog</code>) if your code writes one. Download it from the roboRIO or
      SystemCore, or copy it off the USB stick.</li>
    <li><strong>SystemCore support bundle</strong> (<code>.zip</code> or <code>.llsupport</code>) from the device's web page.</li>
    <li><strong>Your robot code</strong>, zipped. Zip the project folder. It helps a CSA read the code with you
      instead of over your shoulder.</li>
  </ul>
  <p class="hint">Up to 25 files at a time. Nothing here is public: only event volunteers can open it.</p>
</div>

<footer>FTA Buddy. Logs are kept for the event and shared only by a volunteer choosing to share them.</footer>
`,
	);
}

export interface PortalResultOptions {
	code: string;
	team: number | null;
	teamSource: string;
	fileCount: number;
	matches: { level: string; matchNumber: number; how: string }[];
	warnings: string[];
	eventName?: string;
}

const TEAM_SOURCE_TEXT: Record<string, string> = {
	"log-station": "read from the driver station in your data log",
	"support-bundle": "read from your support bundle",
	"robot-code": "read from your robot project",
	entered: "as you typed it",
	none: "",
};

export function portalResultPage(options: PortalResultOptions): string {
	const teamLine = options.team
		? `<p class="ok">Team ${options.team} ${TEAM_SOURCE_TEXT[options.teamSource] ?? ""}.</p>`
		: `<p>We could not tell which team this is. Tell the CSA your code and they will set it.</p>`;
	const matchLine =
		options.matches.length > 0
			? `<p>Matched to ${options.matches
					.map((m) => `${escapeHtml(m.level)} ${m.matchNumber}`)
					.join(", ")}, so the CSA sees the field's own log next to yours.</p>`
			: "";
	const warnings =
		options.warnings.length > 0
			? `<div class="card warn"><strong>Note:</strong><ul>${options.warnings
					.map((w) => `<li>${escapeHtml(w)}</li>`)
					.join("")}</ul></div>`
			: "";

	return page(
		"Uploaded",
		`
<h1>Got it</h1>
<p class="lede">${options.fileCount} file${options.fileCount === 1 ? "" : "s"} uploaded${options.eventName ? ` to ${escapeHtml(options.eventName)}` : ""}.</p>
<div class="card">
  <p>Give this code to the CSA:</p>
  <p class="code">${escapeHtml(options.code)}</p>
  ${teamLine}
  ${matchLine}
</div>
${warnings}
<div class="card">
  <a href="/upload">Upload something else</a>
</div>
<footer>Write the code down. It is how a volunteer finds your files.</footer>
`,
	);
}

export function portalErrorPage(message: string): string {
	return page(
		"Upload failed",
		`
<h1>That did not go through</h1>
<div class="card warn">${escapeHtml(message)}</div>
<div class="card"><a href="/upload">Try again</a></div>
`,
	);
}

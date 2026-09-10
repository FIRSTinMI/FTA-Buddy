import { describe, expect, test } from "bun:test";
import { renderInline, renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
	test("escapes html", () => {
		expect(renderMarkdown('<script>alert("x")</script>')).toBe(
			"<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
		);
	});

	test("numbered steps become an ordered list", () => {
		const html = renderMarkdown("1. Check the **radio**.\n2. Power cycle it.");
		expect(html).toBe('<ol start="1"><li>Check the <strong>radio</strong>.</li><li>Power cycle it.</li></ol>');
	});

	test("bullets, paragraphs and inline code", () => {
		const html = renderMarkdown("Intro line\n\n- run `ipconfig`\n- look for `10.TE.AM.x`");
		expect(html).toBe(
			"<p>Intro line</p><ul><li>run <code>ipconfig</code></li><li>look for <code>10.TE.AM.x</code></li></ul>",
		);
	});

	test("links only allow http(s)", () => {
		expect(renderInline("[docs](https://docs.wpilib.org/x)")).toBe(
			'<a href="https://docs.wpilib.org/x" target="_blank" rel="noopener noreferrer">docs</a>',
		);
		expect(renderInline("[bad](javascript:alert(1))")).toBe("[bad](javascript:alert(1))");
	});

	test("formatting inside code is left alone", () => {
		expect(renderInline("`**not bold**`")).toBe("<code>**not bold**</code>");
	});

	test("headings become bold paragraphs and italics render", () => {
		expect(renderMarkdown("## Step\n*note*")).toBe("<p><strong>Step</strong></p><p><em>note</em></p>");
	});

	test("single newlines inside a paragraph become br", () => {
		expect(renderMarkdown("a\nb")).toBe("<p>a<br>b</p>");
	});
});

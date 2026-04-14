/** WCAG relative luminance of a hex color (#rrggbb). */
function luminance(hex: string): number {
	const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(l1: number, l2: number): number {
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function hslToHex(h: number, s: number, l: number): string {
	h /= 360;
	s /= 100;
	l /= 100;
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	let cr, cg, cb;
	if (s === 0) {
		cr = cg = cb = l;
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		cr = hue2rgb(p, q, h + 1 / 3);
		cg = hue2rgb(p, q, h);
		cb = hue2rgb(p, q, h - 1 / 3);
	}
	const toHex = (x: number) =>
		Math.round(x * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(cr)}${toHex(cg)}${toHex(cb)}`;
}

/**
 * For a solid colored background, returns either white or near-black text
 * to maximise WCAG contrast ratio.
 */
export function getContrastTextColor(hex: string): "#ffffff" | "#111827" {
	if (!hex || !hex.startsWith("#") || hex.length < 7) return "#ffffff";
	const l = luminance(hex);
	const whiteContrast = contrastRatio(l, 1.0);
	const blackContrast = contrastRatio(l, 0.027); // #111827
	return blackContrast > whiteContrast ? "#111827" : "#ffffff";
}

/**
 * For text placed directly on the page background (not on a solid color swatch),
 * returns the hex color shifted in lightness until it reaches ≥3.5:1 contrast.
 * Used when a custom sub-event color is used as a text/border accent colour.
 *
 * @param hex     The raw custom color.
 * @param isDark  Whether the page is currently in dark mode.
 */
export function getReadableTextColor(hex: string, isDark: boolean): string {
	if (!hex || !hex.startsWith("#") || hex.length < 7) return hex;

	// Approximate page background luminance (dark ≈ neutral-800, light ≈ near-white)
	const bgLuminance = isDark ? 0.034 : 0.95;
	if (contrastRatio(luminance(hex), bgLuminance) >= 3.5) return hex;

	// Decompose to HSL
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let hue = 0,
		sat = 0;
	const lit = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		sat = lit > 0.5 ? d / (2 - max - min) : d / (max + min);
		if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (max === g) hue = ((b - r) / d + 2) / 6;
		else hue = ((r - g) / d + 4) / 6;
	}
	const h360 = hue * 360,
		s100 = sat * 100,
		l100 = lit * 100;

	if (isDark) {
		for (let newL = Math.max(l100, 50); newL <= 95; newL += 2) {
			const candidate = hslToHex(h360, s100, newL);
			if (contrastRatio(luminance(candidate), bgLuminance) >= 3.5) return candidate;
		}
		return hslToHex(h360, s100, 85);
	} else {
		for (let newL = Math.min(l100, 50); newL >= 5; newL -= 2) {
			const candidate = hslToHex(h360, s100, newL);
			if (contrastRatio(luminance(candidate), bgLuminance) >= 3.5) return candidate;
		}
		return hslToHex(h360, s100, 20);
	}
}

export type Toast = (title: string, text: string, color: string) => void;

let _toast: Toast | null = null;

export function registerToast(fn: Toast): void {
	_toast = fn;
}

export const toast = (title: string, text: string, color = "red-500") => {
	const fn = _toast;
	if (!fn) {
		throw new Error(
			"Toast system not initialized. Call registerToast() during app bootstrap before using toast().",
		);
	}
	fn(title, text, color);
};

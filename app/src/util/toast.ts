import { getContext } from "svelte";

export type Toast = (title: string, text: string, color: string) => void;

let _toast: Toast | null = null;

export function registerToast(fn: Toast): void {
	_toast = fn;
}

export function getToast(): Toast {
	return getContext("toast") as Toast;
}

export const toast = (title: string, text: string, color = "red-500") => {
	(_toast ?? getToast())(title, text, color);
};

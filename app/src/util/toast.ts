export type Toast = (title: string, text: string, color: string) => void;

export function getToast(): Toast {
    return (window as any).toast as Toast;
}

export const toast = (title: string, text: string, color = "red-500") => (getToast())(title, text, color);

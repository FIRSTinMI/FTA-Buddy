declare module 'svelte-qrcode' {
    import { SvelteComponentTyped } from "svelte";

    interface QRCodeProps {
        value: string,
        background?: string,
        errorCorrection?: "L" | "M" | "Q" | "H",
        padding?: number,
        size?: number
    }

    export default class QRCode extends SvelteComponentTyped<QRCodeProps> {}
}
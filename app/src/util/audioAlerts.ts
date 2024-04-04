import type { ROBOT } from "../../../shared/types";

const audioClips: AudioClips = {
    robot: {
        red1: {
            ds: new Audio('/app/audio/red1_ds.ogg'),
            radio: new Audio('/app/audio/red1_radio.ogg'),
            rio: new Audio('/app/audio/red1_rio.ogg'),
            code: new Audio('/app/audio/red1_code.ogg'),
            astop: new Audio('/app/audio/red1_astop.ogg'),
            estop: new Audio('/app/audio/red1_estop.ogg')
        },
        red2: {
            ds: new Audio('/app/audio/red2_ds.ogg'),
            radio: new Audio('/app/audio/red2_radio.ogg'),
            rio: new Audio('/app/audio/red2_rio.ogg'),
            code: new Audio('/app/audio/red2_code.ogg'),
            astop: new Audio('/app/audio/red2_astop.ogg'),
            estop: new Audio('/app/audio/red2_estop.ogg')
        },
        red3: {
            ds: new Audio('/app/audio/red3_ds.ogg'),
            radio: new Audio('/app/audio/red3_radio.ogg'),
            rio: new Audio('/app/audio/red3_rio.ogg'),
            code: new Audio('/app/audio/red3_code.ogg'),
            astop: new Audio('/app/audio/red3_astop.ogg'),
            estop: new Audio('/app/audio/red3_estop.ogg')
        },
        blue1: {
            ds: new Audio('/app/audio/blue1_ds.ogg'),
            radio: new Audio('/app/audio/blue1_radio.ogg'),
            rio: new Audio('/app/audio/blue1_rio.ogg'),
            code: new Audio('/app/audio/blue1_code.ogg'),
            astop: new Audio('/app/audio/blue1_astop.ogg'),
            estop: new Audio('/app/audio/blue1_estop.ogg')
        },
        blue2: {
            ds: new Audio('/app/audio/blue2_ds.ogg'),
            radio: new Audio('/app/audio/blue2_radio.ogg'),
            rio: new Audio('/app/audio/blue2_rio.ogg'),
            code: new Audio('/app/audio/blue2_code.ogg'),
            astop: new Audio('/app/audio/blue2_astop.ogg'),
            estop: new Audio('/app/audio/blue2_estop.ogg')
        },
        blue3: {
            ds: new Audio('/app/audio/blue3_ds.ogg'),
            radio: new Audio('/app/audio/blue3_radio.ogg'),
            rio: new Audio('/app/audio/blue3_rio.ogg'),
            code: new Audio('/app/audio/blue3_code.ogg'),
            astop: new Audio('/app/audio/blue3_astop.ogg'),
            estop: new Audio('/app/audio/blue3_estop.ogg')
        }
    },
    green: [
        new Audio('/app/audio/green1.ogg'),
        new Audio('/app/audio/green2.ogg'),
        new Audio('/app/audio/green3.ogg')
    ],
    other: {
        goodJob: new Audio('/app/audio/good_job.ogg')
    }
}

interface AudioClips {
    robot: { [key in ROBOT]: { ds: HTMLAudioElement, radio: HTMLAudioElement, rio: HTMLAudioElement, code: HTMLAudioElement, astop: HTMLAudioElement, estop: HTMLAudioElement } },
    green: HTMLAudioElement[],
    other: { [key: string]: HTMLAudioElement }
}

export class AudioQueuer {
    private queue: { audio: HTMLAudioElement, robot: ROBOT | undefined, clip: 'ds' | 'radio' | 'rio' | 'code' | 'astop' | 'estop' }[] = [];
    private playing: boolean = false;

    constructor() {
    }

    public addRobotClip(robot: ROBOT, clip: 'ds' | 'radio' | 'rio' | 'code' | 'astop' | 'estop') {
        // If there is a clip for this robot in queue, and it's less severe than the new clip, remove it
        // If the new clip is less severe than the existing clip, don't add it
        const existingClipsForRobot = this.queue.filter(({ robot: r }) => r === robot);
        for (const existingClip of existingClipsForRobot) {
            let remove = false;

            if (clip === 'ds') remove = true;
            if (clip === 'radio') {
                if (existingClip.clip !== 'ds') remove = true;
                else return;
            }
            if (clip === 'rio') {
                if (existingClip.clip !== 'ds' && existingClip.clip !== 'radio') remove = true;
                else return;
            }
            if (clip === 'code') {
                if (existingClip.clip !== 'ds' && existingClip.clip !== 'radio' && existingClip.clip !== 'rio') remove = true;
                else return;
            }

            if (remove) {
                existingClip.audio.pause();
                this.queue.slice(this.queue.indexOf(existingClip), 1);
            }
        }

        console.log('Adding clip', robot, clip);
        this.queue.push({ audio: audioClips.robot[robot][clip], robot, clip });
        if (!this.playing) this.playNext();
    }

    public addOtherClip(clip: keyof AudioClips['other']) {
        console.log('Adding clip', clip);
        this.queue.push({ audio: audioClips.other[clip], robot: undefined, clip: 'ds' });
        if (!this.playing) this.playNext();
    }

    public addGreenClip() {
        console.log('Adding clip Green');
        this.queue.push({ audio: audioClips.green[Math.floor(Math.random() * audioClips.green.length)], robot: undefined, clip: 'ds' });
        if (!this.playing) this.playNext();
    }

    private playNext() {
        console.log('Playing next');
        if (this.queue.length === 0) {
            console.log('Queue empty')
            this.playing = false;
            return;
        }
        console.log('Playing next');

        const audio = this.queue.shift();
        if (!audio) return;
        
        this.playing = true;
        audio.audio.addEventListener('ended', () => this.playNext());
        audio.audio.play();
    }
}

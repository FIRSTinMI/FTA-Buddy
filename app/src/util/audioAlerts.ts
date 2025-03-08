import { get } from "svelte/store";
import type { ROBOT } from "../../../shared/types";
import { settingsStore } from "../stores/settings";

const loadedClips: { [key: string]: HTMLAudioElement; } = {};

const audioClips: AudioClips = {
    robot: {
        red1: {
            ds: 'audio-red1_ds.ogg',
            radio: 'audio-red1_radio.ogg',
            rio: 'audio-red1_rio.ogg',
            code: 'audio-red1_code.ogg',
            astop: 'audio-red1_astop.ogg',
            estop: 'audio-red1_estop.ogg'
        },
        red2: {
            ds: 'audio-red2_ds.ogg',
            radio: 'audio-red2_radio.ogg',
            rio: 'audio-red2_rio.ogg',
            code: 'audio-red2_code.ogg',
            astop: 'audio-red2_astop.ogg',
            estop: 'audio-red2_estop.ogg'
        },
        red3: {
            ds: 'audio-red3_ds.ogg',
            radio: 'audio-red3_radio.ogg',
            rio: 'audio-red3_rio.ogg',
            code: 'audio-red3_code.ogg',
            astop: 'audio-red3_astop.ogg',
            estop: 'audio-red3_estop.ogg'
        },
        blue1: {
            ds: 'audio-blue1_ds.ogg',
            radio: 'audio-blue1_radio.ogg',
            rio: 'audio-blue1_rio.ogg',
            code: 'audio-blue1_code.ogg',
            astop: 'audio-blue1_astop.ogg',
            estop: 'audio-blue1_estop.ogg'
        },
        blue2: {
            ds: 'audio-blue2_ds.ogg',
            radio: 'audio-blue2_radio.ogg',
            rio: 'audio-blue2_rio.ogg',
            code: 'audio-blue2_code.ogg',
            astop: 'audio-blue2_astop.ogg',
            estop: 'audio-blue2_estop.ogg'
        },
        blue3: {
            ds: 'audio-blue3_ds.ogg',
            radio: 'audio-blue3_radio.ogg',
            rio: 'audio-blue3_rio.ogg',
            code: 'audio-blue3_code.ogg',
            astop: 'audio-blue3_astop.ogg',
            estop: 'audio-blue3_estop.ogg'
        }
    },
    green: [
        'audio-green1.ogg',
        'audio-green2.ogg',
        'audio-green3.ogg'
    ],
    other: {
        goodJob: 'audio-good_job.ogg'
    }
};

const musicClips: MusicClips = {
    jazz: [
        'music-jazz0.ogg',
        'music-jazz1.ogg',
        'music-jazz2.ogg',
        'music-jazz3.ogg',
        'music-jazz4.ogg',
        'music-jazz5.ogg',
        'music-jazz6.ogg'
    ],
    lofi: [
        'music-lofi0.ogg',
        'music-lofi1.ogg',
        'music-lofi2.ogg',
        'music-lofi3.ogg',
        'music-lofi4.ogg',
        'music-lofi5.ogg',
        'music-lofi6.ogg',
        'music-lofi7.ogg',
        'music-lofi8.ogg'
    ],
    minecraft: [
        'music-minecraft0.ogg',
        'music-minecraft1.ogg',
        'music-minecraft2.ogg',
        'music-minecraft3.ogg',
        'music-minecraft4.ogg',
        'music-minecraft5.ogg',
        'music-minecraft6.ogg',
        'music-minecraft7.ogg',
        'music-minecraft8.ogg',
        'music-minecraft9.ogg',
        'music-minecraft10.ogg',
        'music-minecraft11.ogg',
        'music-minecraft12.ogg',
    ]
};

interface AudioClips {
    robot: { [key in ROBOT]: { ds: string, radio: string, rio: string, code: string, astop: string, estop: string; } },
    green: string[],
    other: { [key: string]: string; };
}

interface MusicClips {
    jazz: string[];
    lofi: string[];
    minecraft: string[];
}

export class AudioQueuer {
    private queue: { audio: HTMLAudioElement, robot: ROBOT | undefined, clip: 'ds' | 'radio' | 'rio' | 'code' | 'astop' | 'estop'; }[] = [];
    private playing: boolean = false;
    private music: HTMLAudioElement | undefined;

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
        this.queue.push({ audio: this.getClip(audioClips.robot[robot][clip]), robot, clip });
        if (!this.playing) this.playNext();
    }

    public addOtherClip(clip: keyof AudioClips['other']) {
        console.log('Adding clip', clip);
        this.queue.push({ audio: this.getClip(audioClips.other[clip]), robot: undefined, clip: 'ds' });
        if (!this.playing) this.playNext();
    }

    public addGreenClip() {
        console.log('Adding clip Green');
        if (this.queue.some(({ audio }) => audio.src.includes('green'))) return; // Green debounce
        this.queue.push({ audio: this.getClip(audioClips.green[Math.floor(Math.random() * audioClips.green.length)]), robot: undefined, clip: 'ds' });
        if (!this.playing) this.playNext();
    }

    private async playNext() {
        console.log('Playing next');
        if (this.queue.length === 0) {
            console.log('Queue empty');
            this.playing = false;
            return;
        }
        console.log('Playing next');

        const audio = this.queue.shift();
        if (!audio) return;

        this.playing = true;
        audio.audio.addEventListener('ended', () => this.playNext());
        await this.tryToPlay(audio.audio);
    }

    private async tryToPlay(audio: HTMLAudioElement) {
        try {
            await audio.play();
        } catch (err) {
            await new Promise(resolve => setTimeout(resolve, 500));
            this.tryToPlay(audio);
        }
    }

    public playMusic(musicOrder: number[] = []) {
        console.log('Playing music');

        if (this.music) {
            this.music.pause();
            this.music.removeEventListener('ended', () => this.playMusic(musicOrder));
            this.music = undefined;
        }

        const settings = get(settingsStore);

        if (settings.musicType === 'none') return;

        const musicClipsGenre = musicClips[settings.musicType];

        // If we somehow ran out of track selections then just start playing random music
        if (musicOrder.length < 1) musicOrder = [Math.floor(Math.random() * 16)];
        let newSong = musicOrder[0];
        // The music order supports up to 16 tracks, so if we have fewer than that in this genre
        while (newSong >= musicClipsGenre.length) newSong -= musicClipsGenre.length;

        this.music = this.getClip(musicClipsGenre[newSong]);
        this.music.addEventListener('ended', () => this.playMusic(musicOrder.slice(1)));
        this.music.volume = settings.musicVolume / 100;
        this.music.play();
    }

    public stopMusic() {
        if (this.music) {
            this.music.pause();
            this.music.removeEventListener('ended', () => this.playMusic([]));
            this.music = undefined;
        }
    }

    public setMusicVolume(volume: number) {
        if (this.music) this.music.volume = (volume / 100);
    }

    private getClip(key: string): HTMLAudioElement {
        if (loadedClips[key]) return loadedClips[key];
        const name = key.split('-');
        const clip = new Audio(`/app/${name[0]}/${name[1]}`);
        clip.load();
        loadedClips[key] = clip;
        return clip;
    }
}

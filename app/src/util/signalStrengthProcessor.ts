export function processSignalStrength(signalStrength: number[]): number[] {
    for (let i = 0; i < signalStrength.length; i++) {
        if (signalStrength[i] === 0) {
            if (i > 0 && i < signalStrength.length - 1) {
                signalStrength[i] = Math.round((signalStrength[i - 1] + signalStrength[i + 1]) / 2); 
            } else if (i > 0) {
                signalStrength[i] = signalStrength[i - 1];
            } else if (signalStrength.length > 1) {
                signalStrength[i] = signalStrength[i + 1];
            } else {
                signalStrength[i] = 0;
            }
        }
    }
    return signalStrength;
}

export function processSignalStrengthForGraph(signalStrength: number[]): ({time: number, data: number})[] {
    const processedSignalStrength = processSignalStrength(signalStrength);
    return processedSignalStrength.map((strength, i) => {
        return { time: i, data: Math.log10(Math.abs(strength))/2*100 };
    });
}
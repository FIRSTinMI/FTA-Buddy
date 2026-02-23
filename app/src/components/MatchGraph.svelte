<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { FMSLogFrame, MatchLog } from "../../../shared/types";
    import { echarts, type ECharts, type ECOption } from "../util/echarts";

    export let data: MatchLog;
    export let log: MatchLog['log'];
    export let stat: keyof FMSLogFrame;
    export let graphConfig: Partial<Record<keyof FMSLogFrame, {
        label: string,
        min: number,
        max: number,
        type?: 'logarithmic' | 'linear',
    }>> = {
        'battery': {
            label: 'Voltage',
            min: 6,
            max: 14,
        },
        'averageTripTime': {
            label: 'Average Trip Time (ms)',
            min: 0,
            max: 10,
        },
        'dataRateTotal': {
            label: 'Bandwidth (MB/s)',
            min: 0,
            max: 4.5,
        },
        'lostPackets': {
            label: 'Lost Packets',
            min: 1,
            max: 10000,
            type: 'logarithmic',
        },
        'signal': {
            label: 'Signal (dBm)',
            min: -100,
            max: -30,
        },
        'noise': {
            label: 'Noise (dBm)',
            min: -100,
            max: -80,
        },
        'txMCS': {
            label: 'TX MCS',
            min: 9,
            max: 20,
        },
        'rxMCS': {
            label: 'RX MCS',
            min: 9,
            max: 20,
        },
    };

    let chartContainer: HTMLDivElement;
    let chart: ECharts;
    let observer: ResizeObserver;

    // Team series definitions
    const teamSeries = [
        { label: `Blue 1 - ${data.blue1}`, color: '#2bb1cf', station: 'blue1' as const },
        { label: `Blue 2 - ${data.blue2}`, color: '#008aff', station: 'blue2' as const },
        { label: `Blue 3 - ${data.blue3}`, color: '#780aff', station: 'blue3' as const },
        { label: `Red 1 - ${data.red1}`,   color: '#cf0048', station: 'red1'  as const },
        { label: `Red 2 - ${data.red2}`,   color: '#fc7425', station: 'red2'  as const },
        { label: `Red 3 - ${data.red3}`,   color: '#ffd000', station: 'red3'  as const },
    ];

    // Lane series (Auto/Teleop) — hidden from legend
    const laneDefs = [
        { name: 'Auto',   color: 'rgb(54, 162, 235)',  field: (f: MatchLog['log'][number]) => f.auto  ? 1.01 : null },
        { name: 'Teleop', color: 'rgb(153, 102, 155)', field: (f: MatchLog['log'][number]) => !f.auto ? 1.01 : null },
    ];

    // Custom legend visibility state
    let visibleSeries: Record<string, boolean> = {};
    for (const s of teamSeries) {
        visibleSeries[s.label] = true;
    }

    let isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    function buildOption(): ECOption {
        const cfg = graphConfig[stat];
        const isLog = cfg?.type === 'logarithmic';

        const series: ECOption['series'] = [
            // Team series
            ...teamSeries.map(s => ({
                name: s.label,
                type: 'line' as const,
                showSymbol: false,
                yAxisIndex: 0,
                lineStyle: {
                    color: s.color,
                    width: 1.5,
                    ...(visibleSeries[s.label] === false ? { opacity: 0 } : {}),
                },
                itemStyle: {
                    color: s.color,
                    ...(visibleSeries[s.label] === false ? { opacity: 0 } : {}),
                },
                data: log.map(frame => {
                    const teamFrame = frame[s.station];
                    if (!teamFrame) return null;
                    const v = teamFrame[stat];
                    return v == null ? null : Number(v);
                }),
                connectNulls: false,
                silent: visibleSeries[s.label] === false,
                tooltip: { show: visibleSeries[s.label] !== false },
            })),
            // Lane series
            ...laneDefs.map(s => ({
                name: s.name,
                type: 'line' as const,
                showSymbol: false,
                yAxisIndex: 1,
                lineStyle: { color: s.color, width: 2 },
                itemStyle: { color: s.color },
                data: log.map(frame => {
                    const v = s.field(frame);
                    return v == null ? null : Number(v);
                }),
                connectNulls: false,
                tooltip: { show: false },
            })),
        ];

        return {
            grid: {
                left: 50,
                right: isMobile ? 10 : 20,
                top: 10,
                bottom: 60,
                containLabel: false,
            },
            xAxis: {
                type: 'category',
                data: log.map(frame => frame.matchTime),
                inverse: true,
                axisLabel: { interval: 'auto' },
            },
            yAxis: [
                {
                    type: isLog ? 'log' : 'value',
                    position: 'left',
                    min: cfg?.min,
                    max: cfg?.max,
                    name: isMobile ? '' : (cfg?.label ?? ''),
                    nameTextStyle: { fontSize: 11 },
                    splitLine: { show: true },
                    ...(isLog ? { logBase: 10 } : {}),
                },
                {
                    type: 'value',
                    show: false,
                    min: 0,
                    max: 1.02,
                    splitLine: { show: false },
                },
            ] as any,
            series: series as any,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                confine: true,
                triggerOn: isMobile ? 'click' : 'mousemove|click',
                formatter: (params: any) => {
                    if (!Array.isArray(params) || params.length === 0) return '';
                    const idx = params[0].dataIndex;
                    const frame = log[idx];
                    if (!frame) return '';

                    let html = `<div style="text-align:left">`;
                    html += `<div style="margin-bottom:4px"><b>${frame.matchTime}s</b></div>`;
                    for (const p of params) {
                        // Skip lane series
                        if (p.seriesName === 'Auto' || p.seriesName === 'Teleop') continue;
                        if (p.value == null) continue;
                        html += `<div>${p.marker} ${p.seriesName}: <b>${typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</b></div>`;
                    }
                    html += `</div>`;
                    return html;
                },
            },
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    zoomOnMouseWheel: true,
                    moveOnMouseWheel: false,
                    moveOnMouseMove: true,
                    preventDefaultMouseMove: true,
                    minSpan: 5,
                    throttle: 120,
                },
                {
                    type: 'slider',
                    xAxisIndex: 0,
                    filterMode: 'none',
                    bottom: 8,
                    height: 20,
                },
            ],
            animation: false,
        };
    }

    function handleResize() {
        if (!chart) return;
        const newIsMobile = chartContainer.clientWidth < 768;
        if (newIsMobile !== isMobile) {
            isMobile = newIsMobile;
            chart.setOption(buildOption(), { replaceMerge: ['yAxis'] });
        }
        chart.resize();
    }

    function legendClick(label: string, event: MouseEvent) {
        if (event.shiftKey) {
            // Shift-click: toggle all OTHER team series (isolate behavior)
            for (const s of teamSeries) {
                if (s.label !== label) {
                    visibleSeries[s.label] = !visibleSeries[s.label];
                }
            }
        } else {
            // Normal click: toggle this series
            visibleSeries[label] = !visibleSeries[label];
        }
        visibleSeries = visibleSeries; // trigger reactivity
        if (chart) {
            chart.setOption(buildOption(), { replaceMerge: ['series'] });
        }
    }

    export function hideAll() {
        for (const s of teamSeries) {
            visibleSeries[s.label] = false;
        }
        visibleSeries = visibleSeries;
        if (chart) {
            chart.setOption(buildOption(), { replaceMerge: ['series'] });
        }
    }

    export function resetZoom() {
        if (!chart) return;
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 });
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 });
    }

    onMount(() => {
        if (!chartContainer) return;
        chart = echarts.init(chartContainer);
        chart.setOption(buildOption());

        observer = new ResizeObserver(() => handleResize());
        observer.observe(chartContainer);
    });

    onDestroy(() => {
        if (observer) observer.disconnect();
        if (chart) chart.dispose();
    });
</script>

<div class="flex flex-col gap-1">
    <!-- Custom legend for team series only + shift-click hint -->
    <p class="text-sm text-gray-500 text-center">Shift click a team to show only that one</p>
    <div class="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm px-1">
        {#each teamSeries as s}
            <button
                class="flex items-center gap-1 cursor-pointer select-none"
                class:opacity-40={!visibleSeries[s.label]}
                on:click={(e) => legendClick(s.label, e)}
            >
                <span class="inline-block w-3 h-3 rounded-sm" style="background-color: {s.color}"></span>
                <span class:line-through={!visibleSeries[s.label]}>{s.label}</span>
            </button>
        {/each}
    </div>
    <!-- Chart container -->
    <div
        bind:this={chartContainer}
        class="w-full"
        style="height: {isMobile ? 'calc(80vw)' : '50vh'}; min-height: 300px; touch-action: pan-y;"
    ></div>
</div>
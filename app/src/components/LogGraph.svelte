<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import type { FMSLogFrame } from "../../../shared/types";
    import { echarts, type ECharts, type ECOption } from "../util/echarts";

    export let log: FMSLogFrame[];

    let chartContainer: HTMLDivElement;
    let chart: ECharts;
    let observer: ResizeObserver;

    // --- Series definitions ---
    // Metric series shown in legend (indices 0-4)
    const metricSeries = [
        { name: 'Voltage',   color: 'rgb(255, 99, 132)',  yAxisIndex: 0, field: 'battery'         as keyof FMSLogFrame, hidden: false },
        { name: 'Ping',      color: 'rgb(54, 162, 235)',  yAxisIndex: 1, field: 'averageTripTime'  as keyof FMSLogFrame, hidden: false },
        { name: 'Bandwidth', color: 'rgb(75, 192, 192)',  yAxisIndex: 2, field: 'dataRateTotal'    as keyof FMSLogFrame, hidden: false },
        { name: 'Signal',    color: 'rgb(153, 102, 255)', yAxisIndex: 3, field: 'signal'           as keyof FMSLogFrame, hidden: true  },
        { name: 'Noise',     color: 'rgb(255, 159, 64)',  yAxisIndex: 4, field: 'noise'            as keyof FMSLogFrame, hidden: true  },
    ];

    // Status lane series (hidden from legend, always on yAxisIndex 5)
    const laneSeries = [
        { name: 'Auto',    color: 'rgb(255, 99, 132)',  width: 4, field: (f: FMSLogFrame) => f.auto         ? 1.01 : null },
        { name: 'Enabled', color: 'rgb(54, 162, 235)',  width: 4, field: (f: FMSLogFrame) => f.enabled      ? 1.01 : null },
        { name: 'Code',    color: 'rgb(153, 102, 155)', width: 1, field: (f: FMSLogFrame) => f.linkActive   ? 1    : null },
        { name: 'RIO',     color: 'rgb(255, 159, 64)',  width: 1, field: (f: FMSLogFrame) => f.rioLink      ? 1    : null },
        { name: 'Radio',   color: 'rgb(75, 192, 192)',  width: 1, field: (f: FMSLogFrame) => f.radioLink    ? 1    : null },
        { name: 'DS',      color: 'rgb(75, 192, 192)',  width: 1, field: (f: FMSLogFrame) => f.dsLinkActive ? 1    : null },
    ];

    // Custom legend state — tracks which metric series are visible
    let visibleSeries: Record<string, boolean> = {};
    for (const s of metricSeries) {
        visibleSeries[s.name] = !s.hidden;
    }

    // Y-axis default show state (used to restore after mobile collapse)
    const yAxisDefaults = [
        { show: true,  position: 'left'  as const, min: 6,    max: 14,   name: 'Voltage',          offset: 0  },
        { show: true,  position: 'right' as const, min: 0,    max: 50,   name: 'Ping (ms)',        offset: 0  },
        { show: true,  position: 'right' as const, min: 0,    max: 4.5,  name: 'Bandwidth (Mbps)', offset: 60 },
        { show: false, position: 'right' as const, min: -100, max: -30,  name: 'Signal (dBm)',     offset: 120 },
        { show: false, position: 'right' as const, min: -100, max: -30,  name: 'Noise (dBm)',      offset: 180 },
        { show: false, position: 'left'  as const, min: 0,    max: 1.02, name: '',                 offset: 0  }, // hidden lane axis
    ];

    function buildOption(): ECOption {
        const series: ECOption['series'] = [
            // Metric series
            ...metricSeries.map(s => ({
                name: s.name,
                type: 'line' as const,
                showSymbol: false,
                yAxisIndex: s.yAxisIndex,
                lineStyle: { color: s.color, width: 1, ...(visibleSeries[s.name] === false ? { opacity: 0 } : {}) },
                itemStyle: { color: s.color, ...(visibleSeries[s.name] === false ? { opacity: 0 } : {}) },
                data: log.map(f => {
                    const v = f[s.field];
                    return v == null ? null : Number(v);
                }),
                connectNulls: false,
                silent: visibleSeries[s.name] === false,
                tooltip: { show: visibleSeries[s.name] !== false },
            })),
            // Lane series
            ...laneSeries.map(s => ({
                name: s.name,
                type: 'line' as const,
                showSymbol: false,
                yAxisIndex: 5,
                lineStyle: { color: s.color, width: s.width },
                itemStyle: { color: s.color },
                data: log.map(f => {
                    const v = s.field(f);
                    return v == null ? null : Number(v);
                }),
                connectNulls: false,
                tooltip: { show: false },
            })),
        ];

        // Compute which axes should be visible based on series visibility
        const yAxes = yAxisDefaults.map((def, i) => {
            // Lane axis (5) is always hidden; metric axes show if their series is visible AND axis default permits
            const axisVisible = i === 5 ? false :
                i < metricSeries.length ? (visibleSeries[metricSeries[i].name] && def.show) : false;
            return {
                type: 'value' as const,
                show: isMobile ? (i === 0 ? true : false) : axisVisible,
                position: def.position,
                min: def.min,
                max: def.max,
                name: isMobile ? '' : (axisVisible ? def.name : ''),
                nameTextStyle: { fontSize: 11 },
                offset: def.offset,
                splitLine: { show: i === 0 }, // only primary axis draws grid lines
                axisLine: { show: axisVisible },
                axisTick: { show: axisVisible },
                axisLabel: { show: isMobile ? (i === 0) : axisVisible },
            };
        });

        return {
            grid: {
                left: 50,
                right: isMobile ? 10 : 80,
                top: 10,
                bottom: 60,
                containLabel: false,
            },
            xAxis: {
                type: 'category',
                data: log.map(f => f.matchTime),
                axisLabel: { interval: 'auto' },
            },
            yAxis: yAxes as any,
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

                    // Status line
                    let status = '';
                    if (frame.eStopPressed) {
                        status = '<span style="color:#ef4444;font-weight:bold">E-STOPPED</span>';
                    } else if (frame.aStopPressed) {
                        status = '<span style="color:#f97316;font-weight:bold">A-STOPPED</span>';
                    } else if (!frame.dsLinkActive) {
                        status = '<span style="color:#ef4444">No DS Link</span>';
                    } else if (!frame.radioLink) {
                        status = '<span style="color:#ef4444">No Radio</span>';
                    } else if (!frame.rioLink) {
                        status = '<span style="color:#ef4444">No RIO</span>';
                    } else if (!frame.linkActive) {
                        status = '<span style="color:#eab308">No Code</span>';
                    } else if (!frame.enabled) {
                        status = '<span style="color:#6b7280">Disabled</span>';
                    } else {
                        status = '<span style="color:#22c55e">Enabled' + (frame.auto ? ' (Auto)' : ' (Teleop)') + '</span>';
                    }

                    let html = `<div style="text-align:left">`;
                    html += `<div style="margin-bottom:4px"><b>${frame.matchTime}s</b> — ${status}</div>`;
                    for (const p of params) {
                        // Skip lane series
                        if (laneSeries.some(l => l.name === p.seriesName)) continue;
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

    let isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    function handleResize() {
        if (!chart) return;
        const newIsMobile = chartContainer.clientWidth < 768;
        if (newIsMobile !== isMobile) {
            isMobile = newIsMobile;
            chart.setOption(buildOption(), { replaceMerge: ['yAxis'] });
        }
        chart.resize();
    }

    function toggleSeries(name: string) {
        visibleSeries[name] = !visibleSeries[name];
        visibleSeries = visibleSeries; // trigger reactivity
        if (chart) {
            chart.setOption(buildOption(), { replaceMerge: ['yAxis', 'series'] });
        }
    }

    // --- Exported methods for external zoom control ---
    export function zoomToRange(startIndex: number, endIndex: number, padding = 10) {
        if (!chart || !log.length) return;
        // startIndex/endIndex are direct frame indices into the log array
        // Apply padding
        const lo = Math.max(0, Math.min(startIndex, endIndex) - padding);
        const hi = Math.min(log.length - 1, Math.max(startIndex, endIndex) + padding);
        // Convert to percentage of total data range
        const startPct = (lo / (log.length - 1)) * 100;
        const endPct = (hi / (log.length - 1)) * 100;
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: startPct, end: endPct });
        chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: startPct, end: endPct });
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
    <!-- Custom legend for metric series only -->
    <div class="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm px-1">
        {#each metricSeries as s}
            <button
                class="flex items-center gap-1 cursor-pointer select-none"
                class:opacity-40={!visibleSeries[s.name]}
                onclick={() => toggleSeries(s.name)}
            >
                <span class="inline-block w-3 h-3 rounded-sm" style="background-color: {s.color}"></span>
                <span class:line-through={!visibleSeries[s.name]}>{s.name}</span>
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
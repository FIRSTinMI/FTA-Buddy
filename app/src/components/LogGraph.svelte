<script lang="ts">
    import { onMount } from "svelte";
    import type { FMSLogFrame } from "../../../shared/types";
    import { Chart, registerables } from "chart.js";

    export let log: FMSLogFrame[];

    let graph: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let CHART: Chart;

    Chart.register(...registerables);

    const savedScaleState: {[k: string]: boolean} = {
        y: true,
        y1: true,
        y2: true,
        y3: false,
        y4: false,
        y5: false
    }

    function resizeChart() {
        if (CHART?.options.scales) {
            for (let scaleName of Object.keys(CHART.options.scales)) {
                const scale = CHART.options.scales[scaleName];
                if (scale) {
                    if (scaleName === 'y') {
                        if (window.innerWidth < 768) {
                            if (savedScaleState[scaleName]) savedScaleState[scaleName] = scale.title.display as boolean;
                            scale.title.display = false;
                            CHART.options.aspectRatio = 1.2;
                        } else {
                            scale.title.display = savedScaleState[scaleName];
                            CHART.options.aspectRatio = 1.8;
                        }
                    } else {
                        if (window.innerWidth < 768) {
                            if (savedScaleState[scaleName]) savedScaleState[scaleName] = scale.display as boolean;
                            scale.display = false;
                        } else {
                            scale.display = savedScaleState[scaleName];
                        }
                    }
                }
            }
            CHART.update();
        }
    }

    window.addEventListener('resize', resizeChart);

    onMount(() => {
        ctx = graph.getContext('2d');
        if (ctx) {
            CHART = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: log.map((frame) => frame.matchTime),
                    datasets: [
                        {
                            label: 'Voltage',
                            data: log.map((frame) => frame.battery),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgb(255, 99, 132)',
                            yAxisID: 'y',
                            pointRadius: 0,
                        },
                        {
                            label: 'Ping',
                            data: log.map((frame) => frame.averageTripTime),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgb(54, 162, 235)',
                            yAxisID: 'y1',
                            pointRadius: 0,
                        },
                        {
                            label: 'BWU',
                            data: log.map((frame) => frame.dataRateTotal),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgb(75, 192, 192)',
                            yAxisID: 'y2',
                            pointRadius: 0,
                        },
                        {
                            label: 'Signal',
                            data: log.map((frame) => frame.signal),
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgb(153, 102, 255)',
                            yAxisID: 'y3',
                            pointRadius: 0,
                            hidden: true
                        },
                        {
                            label: 'Noise',
                            data: log.map((frame) => frame.noise),
                            borderColor: 'rgb(255, 159, 64)',
                            backgroundColor: 'rgb(255, 159, 64)',
                            yAxisID: 'y4',
                            pointRadius: 0,
                            hidden: true
                        },
                        {
                            label: 'Auto',
                            data: log.map((frame) => frame.auto ? 1.01 : null),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgb(255, 99, 132)',
                            borderWidth: 4,
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'Enabled',
                            data: log.map((frame) => frame.enabled ? 1.01 : null),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgb(54, 162, 235)',
                            borderWidth: 4,
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'Code',
                            data: log.map((frame) => frame.linkActive ? 1 : null),
                            borderColor: 'rgb(153, 102, 155)',
                            backgroundColor: 'rgb(153, 102, 155)',
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'RIO',
                            data: log.map((frame) => frame.rioLink ? 1 : null),
                            borderColor: 'rgb(255, 159, 64)',
                            backgroundColor: 'rgb(255, 159, 64)',
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'Radio',
                            data: log.map((frame) => frame.radioLink ? 1 : null),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgb(75, 192, 192)',
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'DS',
                            data: log.map((frame) => frame.dsLinkActive ? 1 : null),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgb(75, 192, 192)',
                            yAxisID: 'y5',
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    aspectRatio: 1,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            onClick: (event, legendItem) => {
                                // @ts-ignore
                                let y_axis_id = CHART.data.datasets[legendItem.datasetIndex as number].yAxisID;
                                if (CHART.options.scales && y_axis_id) {
                                    let scaleAxis = CHART.options.scales[y_axis_id];
                                    if (scaleAxis) {
                                        CHART.data.datasets[legendItem.datasetIndex as number].hidden = !CHART.data.datasets[legendItem.datasetIndex as number].hidden;
                                        scaleAxis.display = legendItem.hidden;
                                        CHART.update();
                                    }
                                }
                            },
                            labels: {
                                filter: (item, chart) => {
                                    // Logic to remove a particular legend item goes here
                                    return !['Auto', 'Enabled', 'Code', 'RIO', 'Radio', 'DS'].includes(item.text);
                                }
                            }
                        },
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            suggestedMax: 14,
                            suggestedMin: 6,
                            title: {
                                display: true,
                                text: 'Voltage',
                            },
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            suggestedMax: 50,
                            suggestedMin: 0,
                            title: {
                                display: true,
                                text: 'Ping (ms)',
                            },

                            // grid line settings
                            grid: {
                                drawOnChartArea: false,
                            },
                        },
                        y2: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'BWU (Mbps)',
                            },
                            suggestedMax: 4.5,
                            suggestedMin: 0,

                            grid: {
                                drawOnChartArea: false,
                            },
                        },
                        y3: {
                            type: 'linear',
                            display: false,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Signal (dBm)',
                            },
                            suggestedMax: -30,
                            suggestedMin: -100,

                            grid: {
                                drawOnChartArea: false,
                            },
                        },
                        y4: {
                            type: 'linear',
                            display: false,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Noise (dBm)',
                            },
                            suggestedMax: -30,
                            suggestedMin: -100,

                            grid: {
                                drawOnChartArea: false,
                            },
                        },
                        y5: {
                            type: 'linear',
                            display: false,
                            max: 1.02,
                            min: 0,

                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                },
            });
        }
        resizeChart();
    });
</script>

<div>
    <canvas id="graph" bind:this={graph}></canvas>
</div>
<script lang="ts">
    import { onMount } from "svelte";
    import { Chart, registerables } from "chart.js";
	import type { MatchLog } from "../../../shared/types";
	import { Button } from "flowbite-svelte";

    export let data: MatchLog;
    export let log: MatchLog['log'];
    export let stat: keyof MatchLog['log'][0]['blue1'];
    export function hideAll() {
        if (CHART?.data.datasets) {
            for (let dataset of CHART.data.datasets) {
                dataset.hidden = true;
            }
            CHART.update();
        }
    }

    let graph: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let CHART: Chart;

    Chart.register(...registerables);

    const savedScaleState: {[k: string]: boolean} = {
        y: true,
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
                            label: `Blue 1 - ${data.blue1}`,
                            data: log.map((frame) => (frame.blue1 ? frame.blue1[stat] : null)),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgb(255, 99, 132)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0,
                        },
                        {
                            label: `Blue 2 - ${data.blue2}`,
                            data: log.map((frame) => (frame.blue2 ? frame.blue2[stat] : null)),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgb(54, 162, 235)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0,
                        },
                        {
                            label: `Blue 3 - ${data.blue3}`,
                            data: log.map((frame) => (frame.blue3 ? frame.blue3[stat] : null)),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgb(75, 192, 192)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0,
                        },
                        {
                            label: `Red 1 - ${data.red1}`,
                            data: log.map((frame) => (frame.red1 ? frame.red1[stat] : null)),
                            borderColor: 'rgb(153, 102, 255)',
                            backgroundColor: 'rgb(153, 102, 255)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0
                        },
                        {
                            label: `Red 2 - ${data.red2}`,
                            data: log.map((frame) => (frame.red2 ? frame.red2[stat] : null)),
                            borderColor: 'rgb(255, 159, 64)',
                            backgroundColor: 'rgb(255, 159, 64)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0
                        },
                        {
                            label: `Red 3 - ${data.red3}`,
                            data: log.map((frame) => (frame.red3 ? frame.red3[stat] : null)),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgb(255, 99, 132)',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            pointRadius: 0
                        },
                        {
                            label: 'Auto',
                            data: log.map((frame) => frame.auto  ? 1.01 : null),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgb(54, 162, 235)',
                            borderWidth: 2,
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
                        {
                            label: 'Teleop',
                            data: log.map((frame) => !frame.auto ? 1.01 : null),
                            borderColor: 'rgb(153, 102, 155)',
                            backgroundColor: 'rgb(153, 102, 155)',
                            borderWidth: 2,
                            yAxisID: 'y5',
                            pointRadius: 0
                        },
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
                                        // Hide all except clicked if shift
                                        if (event.native.shiftKey) {
                                            for (let [index, dataset] of CHART.data.datasets.entries()) {
                                                if (index !== legendItem.datasetIndex && index < 6) {
                                                    dataset.hidden = !dataset.hidden;
                                                }
                                            }
                                            CHART.update();
                                        } else {
                                            CHART.data.datasets[legendItem.datasetIndex as number].hidden = !CHART.data.datasets[legendItem.datasetIndex as number].hidden;
                                            // scaleAxis.display = legendItem.hidden;
                                            CHART.update();
                                        }
                                    }
                                }
                            },
                            labels: {
                                filter: (item, chart) => {
                                    // Logic to remove a particular legend item goes here
                                    return !['Auto', 'Teleop'].includes(item.text);
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

<div class="flex flex-col">
    <p>Shift click a team to show only that one</p>
    <canvas id="graph" bind:this={graph}></canvas>
</div>
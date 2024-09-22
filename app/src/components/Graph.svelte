<script lang="ts">
    import { curveBasis, line, scaleLinear } from "d3";

    // props
    export let data: { time: number; data: number }[];

    export let min = 6;
    export let max = 14;
    export let time = 20;

    // scales
    const xScale = scaleLinear().domain([0, time]).range([0, 90]);

    const yScale = scaleLinear().domain([min, max]).range([0, 100]);

    // the path generator
    const pathLine = line()
        .x((d) => xScale(d.time))
        .y((d) => yScale((max + min) - d.data))
        .curve(curveBasis);
</script>

<svg viewBox="0 0 100 100">
    <path d={pathLine(data)} />
</svg>

<style>
    path {
        stroke: gray;
        stroke-width: 2;
        fill: none;
        stroke-linecap: round;
    }
</style>

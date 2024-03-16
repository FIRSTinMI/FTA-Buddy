<script lang="ts">
    import { curveBasis, line, scaleLinear } from "d3";


	// props
	export let data: ({ time: number, voltage: number })[];
	
	// scales
	const xScale = scaleLinear()
		.domain([0, 20])
		.range([5, 95]);
	
	const yScale = scaleLinear()
		.domain([0, 14])
		.range([5, 75]);
	
	// the path generator
	const pathLine = line()
		.x(d => xScale(d.time))
		.y(d => yScale(14 - d.voltage))
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
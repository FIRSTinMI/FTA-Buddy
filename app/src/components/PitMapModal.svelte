<script lang="ts">
	import { Button, Modal } from "flowbite-svelte";
	import type { PitMapData, PitMapElement } from "../../../shared/types";
	import { trpc } from "../main";
	import Spinner from "./Spinner.svelte";

	interface Props {
		open: boolean;
		teamNumber: string;
	}

	let { open = $bindable(), teamNumber }: Props = $props();

	let pitMapData: PitMapData | null = $state(null);
	let loading = $state(false);
	let error: string | null = $state(null);
	let teamPitId: string | null = $derived.by(() => {
		if (!pitMapData) return null;
		for (const [id, pit] of Object.entries(pitMapData.pits)) {
			if (pit.team === teamNumber) return id;
		}
		return null;
	});

	$effect(() => {
		if (open) {
			fetchPitMap();
		}
	});

	async function fetchPitMap() {
		loading = true;
		error = null;
		try {
			pitMapData = await trpc.event.getPitMap.query();
		} catch (e: any) {
			error = e?.message ?? "Failed to load pit map";
		} finally {
			loading = false;
		}
	}

	// Some API entries are empty objects {} - skip those
	function hasGeometry(el: any): el is PitMapElement {
		return el?.position?.x != null && el?.size?.x != null;
	}

	function getViewBox(data: PitMapData): string {
		const padding = 20;
		// Use the map's declared size if available
		if (data.size?.x && data.size?.y) {
			return `${-padding} ${-padding} ${data.size.x + padding * 2} ${data.size.y + padding * 2}`;
		}
		// Fallback: compute from elements
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		function expand(el: PitMapElement) {
			minX = Math.min(minX, el.position.x);
			minY = Math.min(minY, el.position.y);
			maxX = Math.max(maxX, el.position.x + el.size.x);
			maxY = Math.max(maxY, el.position.y + el.size.y);
		}
		Object.values(data.pits).filter(hasGeometry).forEach(expand);
		Object.values(data.areas ?? {})
			.filter(hasGeometry)
			.forEach(expand);
		Object.values(data.walls ?? {})
			.filter(hasGeometry)
			.forEach(expand);
		Object.values(data.labels ?? {})
			.filter(hasGeometry)
			.forEach(expand);
		Object.values(data.arrows ?? {})
			.filter(hasGeometry)
			.forEach(expand);
		if (minX === Infinity) return "0 0 100 100";
		return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
	}

	// Returns SVG polygon points for a single arrowhead triangle.
	// cx/cy = center, hw/hh = half-width/half-height, angle = rotation in degrees
	function arrowTriangle(cx: number, cy: number, hw: number, hh: number, angle: number): string {
		const rad = (angle * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		return [
			[0, -hh],
			[hw, hh],
			[-hw, hh],
		]
			.map(([px, py]) => `${px! * cos - py! * sin + cx},${px! * sin + py! * cos + cy}`)
			.join(" ");
	}
</script>

<Modal bind:open size="xl" outsideclose>
	{#snippet header()}
		<span class="text-lg font-semibold">Pit Map - Team {teamNumber}</span>
		{#if teamPitId}
			<span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Pit {teamPitId}</span>
		{/if}
	{/snippet}

	<div class="flex items-center justify-center min-h-48">
		{#if loading}
			<Spinner />
		{:else if error}
			<p class="text-red-500">{error}</p>
		{:else if !pitMapData}
			<p class="text-gray-500 dark:text-gray-400">No pit map available for this event.</p>
		{:else}
			<div class="w-full overflow-auto max-h-[65vh]">
				<svg
					width="100%"
					viewBox={getViewBox(pitMapData)}
					preserveAspectRatio="xMidYMid meet"
					style="min-width: 320px; display: block;"
					xmlns="http://www.w3.org/2000/svg"
				>
					<!-- Walls -->
					{#each Object.values(pitMapData.walls ?? {}).filter(hasGeometry) as wall}
						<rect
							x={wall.position.x}
							y={wall.position.y}
							width={wall.size.x}
							height={wall.size.y}
							fill="#9ca3af"
							stroke="none"
						/>
					{/each}

					<!-- Areas -->
					{#each Object.values(pitMapData.areas ?? {}).filter(hasGeometry) as area}
						<rect
							x={area.position.x}
							y={area.position.y}
							width={area.size.x}
							height={area.size.y}
							fill="#fef3c7"
							stroke="#d97706"
							stroke-width="2"
							rx="2"
						/>
						<text
							x={area.position.x + area.size.x / 2}
							y={area.position.y + area.size.y / 2}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size={Math.min(area.size.x, area.size.y) * 0.25}
							fill="#92400e"
							font-weight="600">{area.label}</text
						>
					{/each}

					<!-- Pits -->
					{#each Object.entries(pitMapData.pits).filter(([, p]) => hasGeometry(p)) as [pitId, pit]}
						{@const isTarget = pitId === teamPitId}
						{@const fs = Math.min(pit.size.x, pit.size.y)}
						<rect
							x={pit.position.x}
							y={pit.position.y}
							width={pit.size.x}
							height={pit.size.y}
							fill={isTarget ? "#bfdbfe" : "#e5e7eb"}
							stroke={isTarget ? "#2563eb" : "#9ca3af"}
							stroke-width={isTarget ? 3 : 1}
							rx="2"
						/>
						<!-- Team number (top, bold) -->
						{#if pit.team}
							<text
								x={pit.position.x + pit.size.x / 2}
								y={pit.position.y + pit.size.y * 0.38}
								text-anchor="middle"
								dominant-baseline="middle"
								font-size={fs * 0.28}
								fill={isTarget ? "#1d4ed8" : "#374151"}
								font-weight="700">{pit.team}</text
							>
						{/if}
						<!-- Pit address (bottom, smaller) -->
						<text
							x={pit.position.x + pit.size.x / 2}
							y={pit.position.y + pit.size.y * 0.68}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size={fs * 0.2}
							fill={isTarget ? "#3b82f6" : "#6b7280"}>{pitId}</text
						>
					{/each}

					<!-- Labels -->
					{#each Object.values(pitMapData.labels ?? {}).filter(hasGeometry) as label}
						<text
							x={label.position.x + label.size.x / 2}
							y={label.position.y + label.size.y / 2}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size={Math.min(label.size.x, label.size.y) * 0.4}
							fill="#374151"
							font-weight="600">{label.label}</text
						>
					{/each}

					<!-- Arrows -->
					{#each Object.values(pitMapData.arrows ?? {}).filter(hasGeometry) as arrow}
						{@const cx = arrow.position.x + arrow.size.x / 2}
						{@const cy = arrow.position.y + arrow.size.y / 2}
						{@const hw = arrow.size.x / 2}
						{@const hh = arrow.size.y / 2}
						{#if arrow.type === "double"}
							<!-- Two half-size triangles offset along the arrow axis -->
							{@const rad = (arrow.angle * Math.PI) / 180}
							{@const dx = Math.sin(rad) * hh * 0.4}
							{@const dy = -Math.cos(rad) * hh * 0.4}
							<polygon
								points={arrowTriangle(cx + dx, cy + dy, hw * 0.8, hh * 0.6, arrow.angle)}
								fill="#6b7280"
							/>
							<polygon
								points={arrowTriangle(cx - dx, cy - dy, hw * 0.8, hh * 0.6, arrow.angle + 180)}
								fill="#6b7280"
							/>
						{:else}
							<polygon points={arrowTriangle(cx, cy, hw, hh, arrow.angle)} fill="#6b7280" />
						{/if}
					{/each}
				</svg>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Modal>

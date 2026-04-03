<script lang="ts">
	import { Button, Modal } from "flowbite-svelte";
	import type { PitMapData } from "../../../shared/types";
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

	function getViewBox(data: PitMapData): string {
		const padding = 20;
		return `${-padding} ${-padding} ${data.size.x + padding * 2} ${data.size.y + padding * 2}`;
	}

	function arrowPoints(x: number, y: number, w: number, h: number, angle: number): string {
		// Simple triangle pointing up, then rotated
		const cx = x + w / 2;
		const cy = y + h / 2;
		const hw = w / 2;
		const hh = h / 2;
		// Points relative to center
		const pts = [
			[0, -hh],
			[hw, hh],
			[-hw, hh],
		];
		const rad = (angle * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		return pts
			.map(([px, py]) => {
				const rx = px! * cos - py! * sin + cx;
				const ry = px! * sin + py! * cos + cy;
				return `${rx},${ry}`;
			})
			.join(" ");
	}
</script>

<Modal bind:open size="xl" outsideclose>
	{#snippet header()}
		<span class="text-lg font-semibold">Pit Map — Team {teamNumber}</span>
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
			<div class="w-full overflow-auto">
				<svg
					class="w-full h-auto max-h-[70vh]"
					viewBox={getViewBox(pitMapData)}
					xmlns="http://www.w3.org/2000/svg"
				>
					<!-- Walls -->
					{#if pitMapData.walls}
						{#each Object.values(pitMapData.walls) as wall}
							<rect
								x={wall.position.x}
								y={wall.position.y}
								width={wall.size.x}
								height={wall.size.y}
								fill="#6b7280"
								stroke="none"
							/>
						{/each}
					{/if}

					<!-- Areas -->
					{#if pitMapData.areas}
						{#each Object.entries(pitMapData.areas) as [, area]}
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
								font-weight="600"
							>{area.label}</text>
						{/each}
					{/if}

					<!-- Pits -->
					{#each Object.entries(pitMapData.pits) as [pitId, pit]}
						{@const isTarget = pitId === teamPitId}
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
						<!-- Pit label (row/number like "A1") -->
						<text
							x={pit.position.x + pit.size.x / 2}
							y={pit.position.y + pit.size.y * 0.35}
							text-anchor="middle"
							dominant-baseline="middle"
							font-size={Math.min(pit.size.x, pit.size.y) * 0.3}
							fill={isTarget ? "#1d4ed8" : "#374151"}
							font-weight={isTarget ? "700" : "500"}
						>{pitId}</text>
						<!-- Team number -->
						{#if pit.team}
							<text
								x={pit.position.x + pit.size.x / 2}
								y={pit.position.y + pit.size.y * 0.68}
								text-anchor="middle"
								dominant-baseline="middle"
								font-size={Math.min(pit.size.x, pit.size.y) * 0.22}
								fill={isTarget ? "#1e40af" : "#6b7280"}
							>{pit.team}</text>
						{/if}
					{/each}

					<!-- Labels -->
					{#if pitMapData.labels}
						{#each Object.values(pitMapData.labels) as label}
							<text
								x={label.position.x + label.size.x / 2}
								y={label.position.y + label.size.y / 2}
								text-anchor="middle"
								dominant-baseline="middle"
								font-size={Math.min(label.size.x, label.size.y) * 0.4}
								fill="#374151"
								font-weight="600"
							>{label.label}</text>
						{/each}
					{/if}

					<!-- Arrows -->
					{#if pitMapData.arrows}
						{#each Object.values(pitMapData.arrows) as arrow}
							<polygon
								points={arrowPoints(
									arrow.position.x,
									arrow.position.y,
									arrow.size.x,
									arrow.size.y,
									arrow.angle,
								)}
								fill="#6b7280"
							/>
						{/each}
					{/if}
				</svg>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Modal>

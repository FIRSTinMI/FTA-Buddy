/**
 * Modular ECharts barrel - registers only the components we use to minimize bundle size.
 * Import `echarts` from this file instead of 'echarts' directly.
 */
import { LineChart } from "echarts/charts";
import {
	DataZoomComponent,
	DataZoomInsideComponent,
	DataZoomSliderComponent,
	GridComponent,
	ToolboxComponent,
	TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

import type { LineSeriesOption } from "echarts/charts";
import type {
	DataZoomComponentOption,
	GridComponentOption,
	ToolboxComponentOption,
	TooltipComponentOption,
} from "echarts/components";
import type { ComposeOption } from "echarts/core";

echarts.use([
	CanvasRenderer,
	LineChart,
	GridComponent,
	TooltipComponent,
	DataZoomComponent,
	DataZoomInsideComponent,
	DataZoomSliderComponent,
	ToolboxComponent,
]);

/** Composite option type covering all registered components. */
export type ECOption = ComposeOption<
	LineSeriesOption | GridComponentOption | TooltipComponentOption | DataZoomComponentOption | ToolboxComponentOption
>;

export { echarts };
export type ECharts = ReturnType<typeof echarts.init>;

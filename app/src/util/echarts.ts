/**
 * Modular ECharts barrel — registers only the components we use to minimize bundle size.
 * Import `echarts` from this file instead of 'echarts' directly.
 */
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import {
    GridComponent,
    TooltipComponent,
    DataZoomComponent,
    DataZoomInsideComponent,
    DataZoomSliderComponent,
    ToolboxComponent,
} from 'echarts/components';

import type { LineSeriesOption } from 'echarts/charts';
import type {
    GridComponentOption,
    TooltipComponentOption,
    DataZoomComponentOption,
    ToolboxComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

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
    | LineSeriesOption
    | GridComponentOption
    | TooltipComponentOption
    | DataZoomComponentOption
    | ToolboxComponentOption
>;

export { echarts };
export type ECharts = ReturnType<typeof echarts.init>;

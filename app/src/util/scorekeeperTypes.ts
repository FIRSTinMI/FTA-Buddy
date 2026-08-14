import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../src/index";

type Outputs = inferRouterOutputs<AppRouter>;

export type ForMatch = Outputs["scorekeeper"]["lineups"]["forMatch"];
export type LineupSide = ForMatch["red"];
export type Alliance = Outputs["scorekeeper"]["alliances"]["list"][number];
export type HistoryCard = Outputs["scorekeeper"]["lineups"]["history"][number];

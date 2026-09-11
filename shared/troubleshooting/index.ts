import { checkTreeIntegrity, treeSchema, type LeafNode, type QuestionNode, type Tree, type TreeNode } from "./types";
import canJson from "./trees/can.json";
import codeDeployJson from "./trees/code-deploy.json";
import driverStationJson from "./trees/driver-station.json";
import fieldConnectionJson from "./trees/field-connection.json";
import matchDropsJson from "./trees/match-drops.json";
import pitConnectJson from "./trees/pit-connect.json";
import powerJson from "./trees/power.json";
import radioJson from "./trees/radio.json";
import roborioJson from "./trees/roborio.json";

export * from "./types";

// Order here is the order shown in the UI. Most common on-field problem first.
const rawTrees: unknown[] = [
	fieldConnectionJson,
	pitConnectJson,
	roborioJson,
	radioJson,
	canJson,
	powerJson,
	matchDropsJson,
	codeDeployJson,
	driverStationJson,
];

function loadTree(raw: unknown): Tree {
	const tree = treeSchema.parse(raw);
	const problems = checkTreeIntegrity(tree);
	if (problems.length > 0) {
		throw new Error(`troubleshooting tree "${tree.id}" is broken:\n  ${problems.join("\n  ")}`);
	}
	return tree;
}

/** Every tree, validated once at import time. */
export const trees: readonly Tree[] = rawTrees.map(loadTree);

// Validate cross-tree links (option.to) once every tree is loaded.
for (const tree of trees) {
	for (const node of Object.values(tree.nodes)) {
		if (node.kind !== "question") continue;
		for (const option of node.options) {
			if (!option.to) continue;
			const target = trees.find((t) => t.id === option.to!.tree);
			if (!target || !(option.to.node in target.nodes)) {
				throw new Error(
					`Tree "${tree.id}" node "${node.id}" links to missing ${option.to.tree}/${option.to.node}`,
				);
			}
		}
	}
}

const treesById: ReadonlyMap<string, Tree> = new Map(trees.map((t) => [t.id, t]));

export function getTree(id: string): Tree | undefined {
	return treesById.get(id);
}

export function getNode(treeId: string, nodeId: string): TreeNode | undefined {
	return treesById.get(treeId)?.nodes[nodeId];
}

export function isQuestion(node: TreeNode): node is QuestionNode {
	return node.kind === "question";
}

export function isLeaf(node: TreeNode): node is LeafNode {
	return node.kind === "leaf";
}

// #region Shared procedures
/** Points at the guide leaf that owns a fix procedure. */
export interface GuideRef {
	tree: string;
	node: string;
}

/**
 * The steps that live at a guide leaf. Status lights, the field monitor and the guides all read
 * procedures through here, so a fix is written in exactly one place.
 */
export function stepsForRef(ref: GuideRef): readonly (string | import("./steps").FlowStep)[] {
	const node = getNode(ref.tree, ref.node);
	return node && node.kind === "leaf" ? node.steps : [];
}

/** Deep link to the guide leaf, so any surface can offer "open the full guide". */
export function guideHref(ref: GuideRef): string {
	return `/troubleshoot/${ref.tree}/${ref.node}`;
}
// #endregion

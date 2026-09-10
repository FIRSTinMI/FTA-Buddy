import { z } from "zod";

// #region Status light devices
// Keys match the accordion sections in app/src/pages/references/StatusLights.svelte.
// A leaf can point at one of these so the UI can deep-link to /references/statuslights#<device>.
export const STATUS_LIGHT_DEVICES = [
	"radio",
	"roborio",
	"revsparkmax",
	"revsparkflex",
	"revpowerdistributionhub",
	"revpneumaticshub",
	"ctretalonfx",
	"ctretalonfxs",
	"ctretalonsrx",
	"ctrevictorspx",
	"ctrecanivore",
	"ctrepigeon",
	"ctrecancoder",
	"ctretbcancoder",
	"ctrecanrange",
	"ctrecandle",
	"ctrepowerdistributionpanel",
	"ctrepneumaticscontrolmodule",
] as const;
// #endregion

// #region Schemas
const nodeIdSchema = z
	.string()
	.min(1)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "ids are lower-case words joined with hyphens");

export const linkSchema = z.object({
	label: z.string().min(1),
	url: z.url({ protocol: /^https$/ }),
});

export const statusLightHintSchema = z.object({
	device: z.enum(STATUS_LIGHT_DEVICES),
	label: z.string().min(1),
});

export const optionSchema = z.object({
	label: z.string().min(1),
	next: nodeIdSchema,
});

export const questionNodeSchema = z.object({
	kind: z.literal("question"),
	id: nodeIdSchema,
	question: z.string().min(1),
	help: z.string().min(1).optional(),
	options: z.array(optionSchema).min(2),
});

export const leafNodeSchema = z.object({
	kind: z.literal("leaf"),
	id: nodeIdSchema,
	title: z.string().min(1),
	steps: z.array(z.string().min(1)).min(1),
	links: z.array(linkSchema).optional(),
	statusLights: z.array(statusLightHintSchema).optional(),
	escalate: z.boolean().optional(),
});

export const nodeSchema = z.discriminatedUnion("kind", [questionNodeSchema, leafNodeSchema]);

export const treeSchema = z.object({
	id: nodeIdSchema,
	title: z.string().min(1),
	summary: z.string().min(1),
	start: nodeIdSchema,
	nodes: z.record(nodeIdSchema, nodeSchema),
});
// #endregion

// #region Types
export type StatusLightDevice = (typeof STATUS_LIGHT_DEVICES)[number];
export type Link = z.infer<typeof linkSchema>;
export type StatusLightHint = z.infer<typeof statusLightHintSchema>;
export type Option = z.infer<typeof optionSchema>;
export type QuestionNode = z.infer<typeof questionNodeSchema>;
export type LeafNode = z.infer<typeof leafNodeSchema>;
export type TreeNode = z.infer<typeof nodeSchema>;
export type Tree = z.infer<typeof treeSchema>;
// #endregion

// #region Integrity checks
/**
 * Structural checks the schema cannot express: node keys match node ids, `start` exists,
 * every `next` points at a real node, every node is reachable from `start`.
 * Returns a list of human-readable problems. Empty list means the tree is sound.
 */
export function checkTreeIntegrity(tree: Tree): string[] {
	const problems: string[] = [];
	const ids = Object.keys(tree.nodes);

	for (const [key, node] of Object.entries(tree.nodes)) {
		if (node.id !== key) problems.push(`node key "${key}" does not match node id "${node.id}"`);
	}

	if (!(tree.start in tree.nodes)) problems.push(`start node "${tree.start}" does not exist`);

	for (const node of Object.values(tree.nodes)) {
		if (node.kind !== "question") continue;
		for (const option of node.options) {
			if (!(option.next in tree.nodes)) {
				problems.push(`question "${node.id}" option "${option.label}" points at missing node "${option.next}"`);
			}
		}
	}

	const reachable = new Set<string>();
	const stack = [tree.start];
	while (stack.length > 0) {
		const id = stack.pop();
		if (id === undefined || reachable.has(id)) continue;
		const node = tree.nodes[id];
		if (!node) continue;
		reachable.add(id);
		if (node.kind === "question") stack.push(...node.options.map((o) => o.next));
	}
	for (const id of ids) {
		if (!reachable.has(id)) problems.push(`node "${id}" is not reachable from start`);
	}

	return problems;
}
// #endregion

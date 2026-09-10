// Named people whose attribution is KEPT when Slack threads enter the corpus. Everyone else stays
// anonymous ("@CSA"). These are FRC vendor and FIRST staff whose word carries weight and who post
// publicly in that role. Add more here as needed; keyed by Slack user id.
export interface SlackStaff {
	readonly name: string;
	readonly org: string;
}

export const slackStaff: Record<string, SlackStaff> = {
	// FIRST staff
	U9RA2JBL5: { name: "James", org: "FIRST" },
	U06SN8YKEF8: { name: "Rachel Moore", org: "FIRST" },
	U99QQFKL2: { name: "Kevin O'Connor", org: "FIRST" },
	// CTRE staff
	UGCDVCG9J: { name: "Omar", org: "CTRE" },
	U01AQ0LLS1L: { name: "Dalton", org: "CTRE" },
	U06M7CCJS86: { name: "Ben", org: "CTRE" },
	// REV staff
	U038M7LH6V9: { name: "Greg", org: "REV" },
	UGGKUSU5U: { name: "Michaela", org: "REV" },
	U08ES695Z45: { name: "Dave", org: "REV" },
	U03AEPVJFB3: { name: "Jan", org: "REV" },
};

/** "Kevin O'Connor (FIRST)" for a known staffer, else null. */
export function staffLabel(userId: string | undefined): string | null {
	if (!userId) return null;
	const s = slackStaff[userId];
	return s ? `${s.name} (${s.org})` : null;
}

/**
 * Severity ranking for FMS log issue types.
 * Lower number = higher priority for primaryIssue selection.
 * Issues not in this map default to priority 4.
 *
 * Order: DS > Radio > RIO > Code > all others (BWU, ping, brownout)
 */
export const ISSUE_SEVERITY: Record<string, number> = {
    "DS disconnect":       0,
    "Radio disconnect":    1,
    "RIO disconnect":      2,
    "Code disconnect":     3,
};

/**
 * Maps FMS log issue strings to note issue_type enum values.
 */
export const ISSUE_TYPE_MAP: Record<string, string> = {
    "Code disconnect":     "RoboRioIssue",
    "RIO disconnect":      "RoboRioIssue",
    "Radio disconnect":    "RadioIssue",
    "DS disconnect":       "DSIssue",
    "Brownout":            "RobotPwrIssue",
    "Large spike in ping": "RadioIssue",
    "Sustained high ping": "RadioIssue",
    "Low signal":          "RadioIssue",
    "High BWU":            "RadioIssue",
};

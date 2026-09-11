// Landing list for /troubleshoot. Ordered by how a volunteer describes the problem, not by part.
// Each entry opens a tree at its start node.

export interface Symptom {
	readonly label: string;
	readonly detail: string;
	readonly tree: string;
}

export const symptoms: readonly Symptom[] = [
	{ label: "Robot won't connect on the field", detail: "Field monitor not green before or during a match.", tree: "field-connection" },
	{ label: "Robot won't connect in the pit", detail: "DS cannot reach the robot on a tether or the team's own radio.", tree: "pit-connect" },
	{ label: "Robot dies, reboots or browns out during a match", detail: "Main breaker trips, RIO reboots, voltage dips.", tree: "power" },
	{ label: "Robot drops or lags during a match", detail: "Stays on the schedule but cuts out or gets laggy in a match.", tree: "match-drops" },
	{ label: "Motors or mechanisms do not respond", detail: "One device or a whole section is dead, CAN errors in the DS.", tree: "can" },
	{ label: "Code will not deploy", detail: "Deploy fails from the team laptop in the pit.", tree: "code-deploy" },
	{ label: "roboRIO lights look wrong", detail: "Status blinking, Power red or amber, Comm off.", tree: "roborio" },
	{ label: "Radio lights look wrong, or no Wi-Fi in the pit", detail: "Power, PoE vs barrel, link lights, programming.", tree: "radio" },
	{ label: "Joysticks or the DS laptop are the problem", detail: "Joystick unavailable, USB, firewall, Ethernet vs Wi-Fi.", tree: "driver-station" },
];

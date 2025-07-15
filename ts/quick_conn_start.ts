/* eslint quotes:0 */
/* eslint prefer-spread:0 */

// eslint-disable-next-line import/no-unresolved
// @ts-ignore
import { app } from "../../scripts/app.js";
import { QuickConnection } from "./QuickConnection.js";
import { CircuitBoardLinesFactory } from "./CircuitBoardLines.js";

const quickConnection = new QuickConnection();
quickConnection.init();

const quickConnectionId = "quicker-connections";

const quickConnectionsExt = {
	name: "Quick Connections",
	settings: [
		{
			id: `${quickConnectionId}.enable`,
			name: "Quick connections enable",
			type: "boolean",
			defaultValue: true,
			onChange: (...args) => {
				[quickConnection.enabled] = args;
				if (app?.graph?.change) {
					return app.graph.change.apply(app.graph, args);
				}
				return null;
			},
		},
		{
			id: `${quickConnectionId}.connectDotOnly`,
			category: [quickConnectionId, "enable", "connectDotOnly"],
			name: "Connect with dot",
			tooltip:
				"Disable to connect with text too, a bigger area to release the mouse button on",
			type: "boolean",
			defaultValue: true,
			onChange: (...args) => {
				[quickConnection.connectDotOnly] = args;
				if (app?.graph?.change) {
					return app.graph.change.apply(app.graph, args);
				}
				return null;
			},
		},
	],

	init() {
		quickConnection.initListeners(app.canvas);
	},
};

const circuitBoardLines = new CircuitBoardLinesFactory();
const circuitBoardId = "circuit-board-lines";

const circuitBoardLinesExt = {
	name: "Circuit Board Lines",

	settings: [
		{
			id: `${circuitBoardId}.enable`,
			name: "Circuit Board lines",
			category: [circuitBoardId, "enable"],
			type: "combo",
			options: [
				{ value: 0, text: "Off" },
				{ value: 1, text: "Circuit board" },
				// On top doesn't place the wires on top of the text boxes
				{ value: 2, text: "On top" },
			],
			defaultValue: 1,

			onChange: (...args) => {
				const option = args[0];
				circuitBoardLines.enabled = option === 1;
				if (app.graph) {
					app.graph.config.links_ontop = option === 2;
					return app.graph.change.apply(app.graph, args);
				}
				return null;
			},
		},
	],

	init() {
		console.log("CircuitBoardLines extension init"); // eslint-disable-line no-console
		circuitBoardLines.init(app.canvas);
	},
};

app.registerExtension(quickConnectionsExt);
app.registerExtension(circuitBoardLinesExt);

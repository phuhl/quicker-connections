import { liangBarsky } from "./liangBarsky.js";
import {
	BoundingBox,
	Point,
	Pos,
	Node,
	DOWN,
	LEFT,
	RIGHT,
	UP,
} from "./utils/types.js";
import { drawDebug, RecursiveSearch } from "./RecursiveSearch.js";

import type {
	LGraphCanvas,
	LGraphNode,
	LiteGraph as _LiteGraph,
} from "@comfyorg/litegraph";

declare const LiteGraph: typeof _LiteGraph;

const normalizeVector = (v: Point): Point => {
	const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
	if (len === 0) {
		return [0, 0];
	}
	return [v[0] / len, v[1] / len];
};

const vectorAdd = (a: Point, b: Point) => {
	return [a[0] + b[0], a[1] + b[1]] as Point;
};

const vectorMult = (a: Point, b: number) => {
	return [a[0] * b, a[1] * b] as Point;
};

const getVectorDist = (a: Point, b: Point) => {
	return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
};

const getMnhDist = (a: Point, b: Point) => {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
};

export class MapLinks {
	private nodesByRight: Node[];
	private nodesById: Record<any, Node>;
	private paths: {
		path: Point[];
		startNode: LGraphNode;
		targetNode: LGraphNode;
		startSlot: number;
	}[];
	private lineSpace: number;
	public maxDirectLineDistance: number;
	public debug: boolean;
	public lastCalcTime = 0;
	private lastCalculate?: number;

	constructor(
		private canvas: LGraphCanvas,
		private ctx?: CanvasRenderingContext2D
	) {
		this.nodesByRight = [];
		this.nodesById = {};
		this.paths = [];
		this.lineSpace = Math.floor(LiteGraph.NODE_SLOT_HEIGHT / 4);
		this.maxDirectLineDistance = Number.MAX_SAFE_INTEGER;
		this.debug = false;
	}

	setCtx(ctx: CanvasRenderingContext2D) {
		this.ctx = ctx;
	}

	mapLink(
		outputXY: Point,
		inputXY: Point,
		sourceNodeInfo: Node,
		targetNodeInfo: Node,
		isBlocked: Record<string | number, number>,
		nested: boolean = false,
		nodeBumps: Record<number | string, number[]> = {}
	) {
		this.ctx.save();
		const search = new RecursiveSearch(
			outputXY,
			inputXY,
			this.nodesByRight
			//			this.ctx
		);
		const path = search.run();
		this.ctx.restore();
		if (path) {
			return path;
		}
		return [outputXY, inputXY] as Point[];
	}

	expandSourceNodeLinesArea(sourceNodeInfo: Node, path: Point[]) {
		if (path.length < 3) {
			return false;
		}

		const linesArea = sourceNodeInfo.linesArea;
		if (path[1][0] === path[2][0]) {
			// first link is going vertical
			linesArea[RIGHT] += this.lineSpace;
		}
		return true;
	}

	// expand left side of target node if we're going up there vertically.
	expandTargetNodeLinesArea(targetNodeInfo: Node, path: Point[]) {
		if (path.length < 2) {
			return false;
		}

		const linesArea = targetNodeInfo.linesArea;
		const pathLen = path.length - 1;
		if (path[pathLen - 2][0] === path[pathLen - 1][0]) {
			// last link is going vertical
			linesArea[LEFT] -= this.lineSpace;
		}
		return true;
	}

	getNodeOnPos(xy: Point) {
		for (let i = 0; i < this.nodesByRight.length; ++i) {
			const nodeI = this.nodesByRight[i];
			const { linesArea } = nodeI;
			if (
				xy[0] > linesArea[0] &&
				xy[1] > linesArea[1] &&
				xy[0] < linesArea[2] &&
				xy[1] < linesArea[3]
			) {
				return nodeI;
			}
		}
		return null;
	}

	private previousNodePositions: Record<string | number, BoundingBox> = {};
	private previousLinks: Record<string | number, [string, string]> = {};

	mapLinks(nodesByExecution: LGraphNode[]) {
		if (!this.canvas.graph.links) {
			console.error("Missing graph.links", this.canvas.graph); // eslint-disable-line no-console
			return;
		}

		const startCalcTime = new Date().getTime();

		this.nodesById = {};
		this.nodesByRight = nodesByExecution.map((node) => {
			const bArea = new Float32Array(4);
			node.getBounding(bArea);
			const area = [
				bArea[0] - this.lineSpace / 2,
				bArea[1] - this.lineSpace / 2,
				bArea[0] + bArea[2] + this.lineSpace / 2,
				bArea[1] + bArea[3] + this.lineSpace / 2,
			] as BoundingBox;
			const linesArea = Array.from(area) as BoundingBox;
			linesArea[LEFT] -= this.lineSpace;
			linesArea[UP] -= this.lineSpace;
			linesArea[RIGHT] += this.lineSpace;
			linesArea[DOWN] += this.lineSpace;
			const obj = {
				node,
				area,
				linesArea,
			};
			this.nodesById[node.id] = obj;
			return obj;
		});

		this.nodesByRight.sort((a, b) => a.area[UP] - b.area[UP]);

		const nodeIdsChanged = new Set<string>();
		const linkIdsChanged = new Set<string>();
		for (const id in this.previousNodePositions) {
			if (!this.nodesById[id]) {
				delete this.previousNodePositions[id];
				nodeIdsChanged.add(id);
			}
		}

		for (const id in this.nodesById) {
			if (!this.previousNodePositions[id]) {
				nodeIdsChanged.add(id);
				this.previousNodePositions[id] = this.nodesById[id].area;
				continue;
			}
			if (
				this.previousNodePositions[id][0] !== this.nodesById[id].area[0] ||
				this.previousNodePositions[id][1] !== this.nodesById[id].area[1] ||
				this.previousNodePositions[id][2] !== this.nodesById[id].area[2] ||
				this.previousNodePositions[id][3] !== this.nodesById[id].area[3]
			) {
				nodeIdsChanged.add(id);
				this.previousNodePositions[id] = this.nodesById[id].area;
			}
		}

		for (const link in this.canvas.graph?.links) {
			const linkData = this.canvas.graph.links[link];
			if (!linkData) {
				continue;
			}
			if (
				!this.previousLinks[link] ||
				this.previousLinks[link][0] !== String(linkData.origin_id) ||
				this.previousLinks[link][1] !== String(linkData.target_id)
			) {
				this.previousLinks[link] = [
					String(linkData.origin_id),
					String(linkData.target_id),
				];
				linkIdsChanged.add(link);
			}
		}
		for (const link in this.previousLinks) {
			if (!this.canvas.graph.links[link]) {
				delete this.previousLinks[link];
				linkIdsChanged.add(link);
			}
		}

		for (const linkId of linkIdsChanged) {
			const link = this.canvas.graph?.links[linkId];
			if (link) {
				nodeIdsChanged.add(String(link.origin_id));
				nodeIdsChanged.add(String(link.target_id));
			}
		}

		this.paths = this.paths.filter(
			(path) =>
				!nodeIdsChanged.has(String(path.startNode.id)) &&
				!nodeIdsChanged.has(String(path.targetNode.id)) &&
				!linkIdsChanged.has(
					String(path.startNode.outputs[path.startSlot].links)
				)
		);
		let targetsChanged = new Set<string>();
		for (const id of nodeIdsChanged) {
			for (const output of this.nodesById[id]?.node?.outputs ?? []) {
				targetsChanged = targetsChanged.union(
					new Set(
						output?.links?.map((linkId) =>
							String(this.canvas.graph?.links[linkId].target_id)
						)
					)
				);
			}
		}
		const nodesChangedByInputOrOutput = targetsChanged.union(
			new Set(nodeIdsChanged)
		);
		for (const { node } of this.nodesByRight) {
			if (!node.outputs || !nodesChangedByInputOrOutput.has(String(node.id))) {
				continue;
			}
			for (const input of node.inputs) {
				if (!input.link) {
					continue;
				}
				this.processLink(input.link);
			}
		}
		this.lastCalculate = new Date().getTime();
		this.lastCalcTime = this.lastCalculate - startCalcTime;

		if (this.debug) console.log("last calc time", this.lastCalcTime); // eslint-disable-line no-console
	}

	processLink(linkId: number) {
		const link = this.canvas.graph?.links[linkId];
		const sourceNode = link && this.canvas.graph?.getNodeById(link.origin_id);
		const targetNode = link && this.canvas.graph?.getNodeById(link.target_id);
		if (!link || !sourceNode || !targetNode) {
			return;
		}

		const outputXYConnection = sourceNode.getOutputPos(
			link.origin_slot
		) as Point;
		const outputNodeInfo = this.nodesById[sourceNode.id];
		let outputXY = Array.from(outputXYConnection) as Point;

		const inputXYConnection = targetNode.getInputPos(link.target_slot) as Point;
		const inputXY = Array.from(inputXYConnection) as Point;
		const targetNodeInfo = this.nodesById[targetNode.id];
		const sourceNodeInfo = this.nodesById[sourceNode.id];

		// outputXY[0] = outputNodeInfo.linesArea[RIGHT] + 1;
		// inputXY[0] = targetNodeInfo.linesArea[LEFT] - 1;
		outputXY[0] = outputNodeInfo.linesArea[RIGHT];
		inputXY[0] = targetNodeInfo.linesArea[LEFT];

		const inputBlockedByNode = this.getNodeOnPos(inputXY);
		const outputBlockedByNode = this.getNodeOnPos(outputXY);

		let path = null as Point[] | null;
		if (!inputBlockedByNode && !outputBlockedByNode) {
			const pathFound = this.mapLink(
				outputXY,
				inputXY,
				sourceNodeInfo,
				targetNodeInfo,
				{}
			);
			if (pathFound && pathFound.length > 2) {
				// mapLink() may have expanded the linesArea,
				// lets put it back into the inputXY so the line is straight
				path = [outputXYConnection, ...pathFound, inputXYConnection];
				//				this.expandTargetNodeLinesArea(targetNodeInfo, path);
			}
		}
		if (!path) {
			path = [outputXYConnection, outputXY, inputXY, inputXYConnection];
		}
		//		this.expandSourceNodeLinesArea(outputNodeInfo, path);
		this.paths.push({
			path: path as Point[],
			startNode: sourceNode,
			targetNode,
			startSlot: link.origin_slot,
		});
		outputXY = [outputXY[0] + this.lineSpace, outputXY[1]];
	}

	drawLinks(ctx) {
		if (
			!this.canvas.default_connection_color_byType ||
			!this.canvas.default_connection_color
		) {
			console.error(
				"Missing canvas.default_connection_color_byType",
				this.canvas
			); // eslint-disable-line no-console
			return;
		}
		if (this.debug) console.log("paths", this.paths); // eslint-disable-line no-console

		ctx.save();
		const currentNodeIds = this.canvas.selected_nodes || {};
		const corners = [] as Point[];

		this.paths.forEach((pathI) => {
			const path = pathI.path;
			if (path.length <= 1) {
				return;
			}

			const connection = pathI.startNode.outputs[pathI.startSlot];
			ctx.beginPath();
			const slotColor =
				this.canvas.default_connection_color_byType[connection.type] ||
				this.canvas.default_connection_color.input_on;

			if (
				currentNodeIds[pathI.startNode.id] ||
				currentNodeIds[pathI.targetNode.id]
			) {
				ctx.strokeStyle = "white";
			} else {
				ctx.strokeStyle = slotColor;
			}
			ctx.lineWidth = 3;
			const cornerRadius = this.lineSpace;

			ctx.moveTo(path[0][0], path[0][1]);
			for (let p = 0; p < path.length - 1; ++p) {
				const pos = path[p];

				const prevPos = pos;
				const cornerPos = path[p + 1];
				const nextPos = path[p + 2];

				if (!nextPos) {
					ctx.lineTo(cornerPos[0], cornerPos[1]);
					continue;
				}

				const dist1 = getVectorDist(prevPos, cornerPos);
				const dist2 = getVectorDist(cornerPos, nextPos);

				const directionBeforeCorner = normalizeVector([
					cornerPos[0] - prevPos[0],
					cornerPos[1] - prevPos[1],
				]);
				const directionAfterCorner = normalizeVector([
					nextPos[0] - cornerPos[0],
					nextPos[1] - cornerPos[1],
				]);

				const beforeCorner = vectorAdd(
					cornerPos,
					vectorMult(
						directionBeforeCorner,
						-1 * Math.min(cornerRadius, dist1 / 2)
					)
				);
				const afterCorner = vectorAdd(
					cornerPos,
					vectorMult(directionAfterCorner, Math.min(cornerRadius, dist2 / 2))
				);

				ctx.lineTo(beforeCorner[0], beforeCorner[1]);

				ctx.quadraticCurveTo(
					cornerPos[0],
					cornerPos[1],
					afterCorner[0],
					afterCorner[1]
				);
			}

			ctx.stroke();
			ctx.closePath();

			if (this.debug) {
				for (let p = 0; p < path.length - 1; ++p) {
					const pos = path[p];
					ctx.fillStyle = "#ff0000";
					ctx.beginPath();
					ctx.rect(
						pos[0] - this.lineSpace / 4,
						pos[1] - this.lineSpace / 4,
						this.lineSpace / 2,
						this.lineSpace / 2
					);
					ctx.fill();
				}
			}
		});

		if (this.debug) {
			ctx.lineWidth = 1;
			for (const node of this.nodesByRight) {
				ctx.beginPath();
				ctx.rect(
					node.linesArea[0],
					node.linesArea[1],
					node.linesArea[2] - node.linesArea[0],
					node.linesArea[3] - node.linesArea[1]
				);
				ctx.stroke();
			}
		}

		if (this.debug) {
			corners.filter((corn) => {
				ctx.strokeStyle = "#ff00ff";
				ctx.beginPath();
				ctx.arc(corn[0], corn[1], 1, 0, 2 * Math.PI);
				ctx.stroke();
				return false;
			});

			this.nodesByRight.filter((nodeI) => {
				ctx.lineWidth = 1;
				ctx.strokeStyle = "#000080";
				ctx.beginPath();
				ctx.rect(
					nodeI.area[0],
					nodeI.area[1],
					nodeI.area[2] - nodeI.area[0],
					nodeI.area[3] - nodeI.area[1]
				);
				ctx.stroke();
				ctx.closePath();

				ctx.strokeStyle = "#0000a0";
				ctx.beginPath();
				ctx.rect(
					nodeI.linesArea[0],
					nodeI.linesArea[1],
					nodeI.linesArea[2] - nodeI.linesArea[0],
					nodeI.linesArea[3] - nodeI.linesArea[1]
				);
				ctx.stroke();
				ctx.closePath();
				return false;
			});
		}
		//		drawDebug(ctx);
		ctx.restore();
	}
}

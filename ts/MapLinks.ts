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
import { RecursiveSearch } from "./RecursiveSearch.js";

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

	constructor(private canvas: LGraphCanvas) {
		this.nodesByRight = [];
		this.nodesById = {};
		this.paths = [];
		this.lineSpace = Math.floor(LiteGraph.NODE_SLOT_HEIGHT / 4);
		this.maxDirectLineDistance = Number.MAX_SAFE_INTEGER;
		this.debug = false;
	}

	isInsideNode(xy: Point) {
		for (let i = 0; i < this.nodesByRight.length; ++i) {
			const nodeI = this.nodesByRight[i];
			if (nodeI.node.isPointInside(xy[0], xy[1])) {
				return nodeI.node;
			}
		}
		return null;
	}

	findClippedNode(outputXY: Point, inputXY: Point) {
		let closestDistance = Number.MAX_SAFE_INTEGER;
		let closest = null as null | { start: Point; end: Point; node: Node };

		for (let i = 0; i < this.nodesByRight.length; ++i) {
			const node = this.nodesByRight[i];
			const clipA = [-1, -1] as Point; // outputXY.slice();
			const clipB = [-1, -1] as Point; // inputXY.slice();
			const area = node.linesArea.map((v, i) => (i > UP ? v - 1 : v + 1));
			const clipped = liangBarsky({
				a: outputXY,
				b: inputXY,
				box: area as BoundingBox,
				da: clipA,
				db: clipB,
			});

			if (clipped === Pos.INSIDE) {
				const centerX = area[0] + (area[2] - area[0]) / 2;
				const centerY = area[1] + (area[3] - area[1]) / 2;
				const dist = Math.sqrt(
					(centerX - outputXY[0]) ** 2 + (centerY - outputXY[1]) ** 2
				);
				if (dist < closestDistance) {
					closest = {
						start: clipA,
						end: clipB,
						node,
					};
					closestDistance = dist;
				}
			}
		}
		return { clipped: closest, closestDistance };
	}

	testPath(path: Point[]) {
		const len1 = path.length - 1;
		for (let p = 0; p < len1; ++p) {
			const { clipped } = this.findClippedNode(path[p], path[p + 1]);
			if (clipped) {
				return clipped;
			}
		}
		return null;
	}

	findSimplePathOrBlockingNode(outputXY: Point, inputXY: Point) {
		const { clipped } = this.findClippedNode(outputXY, inputXY);
		if (!clipped) {
			const dist = Math.sqrt(
				(outputXY[0] - inputXY[0]) ** 2 + (outputXY[1] - inputXY[1]) ** 2
			);
			if (dist < this.maxDirectLineDistance) {
				// direct, nothing blocking us
				return { path: [outputXY, inputXY] };
			}
		}

		const path90Straight = [
			[outputXY[0], outputXY[1]],
			[outputXY[0], inputXY[1]],
			[inputXY[0], inputXY[1]],
		] as Point[];
		// |_
		const clippedVert = this.testPath(path90Straight);
		if (!clippedVert) {
			return { path: path90Straight };
		}

		const pathStraight90 = [
			[outputXY[0], outputXY[1]],
			[inputXY[0], outputXY[1]],
			[inputXY[0], inputXY[1]],
		] as Point[];
		// _
		//  |
		//
		// _|
		const clippedHorz = this.testPath(pathStraight90);
		if (!clippedHorz) {
			// add to lines area in destination node?
			// targetNodeInfo.linesArea[0] -= this.lineSpace;
			return { path: pathStraight90 };
		}
		return {
			clippedHorz,
			clippedVert,
		};
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
		const search = new RecursiveSearch(outputXY, inputXY, this.nodesByRight);
		const path = search.run();
		if (path) {
			return path;
		}
		return [outputXY, inputXY] as Point[];

		// const { clippedHorz, clippedVert, path } =
		// 	this.findSimplePathOrBlockingNode(outputXY, inputXY);
		// if (path) {
		// 	return path;
		// }

		// const horzDistance = inputXY[0] - outputXY[0];
		// const vertDistance = inputXY[1] - outputXY[1];
		// const horzDistanceAbs = Math.abs(horzDistance);
		// const vertDistanceAbs = Math.abs(vertDistance);

		// let blockingNodeId = null as string | number | null;
		// let pathAvoidNode = [] as Point[];
		// let lastPathLocation = null as null | Point;

		// if (horzDistanceAbs > vertDistanceAbs) {
		// 	// horz then vert to avoid blocking node
		// 	const blockingLinesArea = clippedHorz.node.linesArea;
		// 	const {
		// 		lastPathLocation: lastPathLocationHorz,
		// 		pathAvoidNode: pathAvoidNodeHorz,
		// 		unblockNotPossible,
		// 	} = this.getRouteHorz(blockingLinesArea, outputXY, inputXY);
		// 	if (unblockNotPossible) {
		// 		// try vert
		// 		const {
		// 			lastPathLocation: lastPathLocationVert,
		// 			pathAvoidNode: pathAvoidNodeVert,
		// 		} = this.getRouteVert(blockingLinesArea, outputXY, inputXY);
		// 		this.adjustBlockingLinesAreaVert(
		// 			vertDistance,
		// 			clippedVert.node.node.id,
		// 			outputXY,
		// 			nodeBumps,
		// 			lastPathLocationVert
		// 		);
		// 		lastPathLocation = lastPathLocationVert;
		// 		pathAvoidNode = pathAvoidNodeVert;
		// 		blockingNodeId = clippedVert.node.node.id;
		// 	} else {
		// 		this.adjustBlockingLinesAreaHorz(
		// 			horzDistance,
		// 			clippedHorz.node.node.id,
		// 			outputXY,
		// 			nodeBumps,
		// 			lastPathLocationHorz
		// 		);
		// 		lastPathLocation = lastPathLocationHorz;
		// 		pathAvoidNode = pathAvoidNodeHorz;
		// 		blockingNodeId = clippedHorz.node.node.id;
		// 	}
		// } else {
		// 	const blockingLinesArea = clippedVert.node.linesArea;
		// 	const {
		// 		lastPathLocation: lastPathLocationVert,
		// 		pathAvoidNode: pathAvoidNodeVert,
		// 		unblockNotPossible,
		// 	} = this.getRouteVert(blockingLinesArea, outputXY, inputXY);
		// 	if (unblockNotPossible) {
		// 		// try horz
		// 		const {
		// 			lastPathLocation: lastPathLocationHorz,
		// 			pathAvoidNode: pathAvoidNodeHorz,
		// 		} = this.getRouteHorz(blockingLinesArea, outputXY, inputXY);
		// 		this.adjustBlockingLinesAreaHorz(
		// 			horzDistance,
		// 			clippedHorz.node.node.id,
		// 			outputXY,
		// 			nodeBumps,
		// 			lastPathLocationHorz
		// 		);
		// 		pathAvoidNode = pathAvoidNodeHorz;
		// 		blockingNodeId = clippedHorz.node.node.id;
		// 		lastPathLocation = lastPathLocationHorz;
		// 	} else {
		// 		this.adjustBlockingLinesAreaVert(
		// 			vertDistance,
		// 			clippedVert.node.node.id,
		// 			outputXY,
		// 			nodeBumps,
		// 			lastPathLocationVert
		// 		);
		// 		pathAvoidNode = pathAvoidNodeVert;
		// 		blockingNodeId = clippedVert.node.node.id;
		// 		lastPathLocation = lastPathLocationVert;
		// 	}
		// }

		// if (isBlocked[blockingNodeId] > 5) {
		// 	// Blocked too many times, let's return the direct path
		// 	console.log("Too many blocked", outputXY, inputXY); // eslint-disable-line no-console
		// 	if (!nested) {
		// 		return [outputXY, inputXY];
		// 	} else {
		// 		return null;
		// 	}
		// }
		// if (isBlocked[blockingNodeId]) {
		// 	++isBlocked[blockingNodeId];
		// } else {
		// 	isBlocked[blockingNodeId] = 1;
		// }
		// // console.log('pathavoid', pathAvoidNode);
		// const nextPath = this.mapLink(
		// 	lastPathLocation,
		// 	inputXY,
		// 	sourceNodeInfo,
		// 	targetNodeInfo,
		// 	isBlocked,
		// 	true,
		// 	nodeBumps
		// ) as Point[] | null;
		// if (!nextPath) {
		// 	if (!nested) {
		// 		return [outputXY, inputXY];
		// 	} else {
		// 		return null;
		// 	}
		// }

		// for (const node in nodeBumps) {
		// 	this.nodesById[node].linesArea[LEFT] -= nodeBumps[node][LEFT];
		// 	this.nodesById[node].linesArea[UP] -= nodeBumps[node][UP];
		// 	this.nodesById[node].linesArea[RIGHT] += nodeBumps[node][RIGHT];
		// 	this.nodesById[node].linesArea[DOWN] += nodeBumps[node][DOWN];
		// }

		// const newPath = [...pathAvoidNode, lastPathLocation, ...nextPath.slice(1)];
		// return newPath.filter(
		// 	(p, i) =>
		// 		newPath.findIndex((p2) => {
		// 			return p[0] === p2[0] && p[1] === p2[1];
		// 		}) === i
		// );
	}

	getRouteHorz(
		blockingLinesArea: BoundingBox,
		outputXY: Point,
		inputXY: Point
	) {
		const horzDistance = inputXY[0] - outputXY[0];

		const horzEdgeX =
			horzDistance <= 0 ? blockingLinesArea[LEFT] : blockingLinesArea[RIGHT];
		const pathAvoidNode = [
			[outputXY[0], outputXY[1]],
			[horzEdgeX, outputXY[1]],
		] as Point[];

		const vertDistanceViaBlockTop =
			Math.abs(inputXY[1] - blockingLinesArea[UP]) +
			Math.abs(outputXY[1] - blockingLinesArea[UP]);
		const vertDistanceViaBlockBottom =
			Math.abs(inputXY[1] - blockingLinesArea[DOWN]) +
			Math.abs(outputXY[1] - blockingLinesArea[DOWN]);
		const aboveIsShorter =
			vertDistanceViaBlockTop <= vertDistanceViaBlockBottom;

		const lastPathLocation = [
			horzEdgeX,
			aboveIsShorter ? blockingLinesArea[UP] : blockingLinesArea[DOWN],
		] as Point;
		const unblockNotPossible = this.testPath([
			...pathAvoidNode,
			lastPathLocation,
		]);
		return {
			unblockNotPossible,
			lastPathLocation,
			pathAvoidNode,
		};
	}

	adjustBlockingLinesAreaHorz(
		horzDistance: number,
		blockingNodeId: string | number,
		outputXY: Point,
		nodeBumps: Record<number | string, number[]>,
		lastPathLocation: Point
	) {
		nodeBumps[blockingNodeId] = nodeBumps[blockingNodeId] || [0, 0, 0, 0];
		if (horzDistance <= 0) {
			nodeBumps[blockingNodeId][RIGHT] += this.lineSpace;
		} else {
			nodeBumps[blockingNodeId][LEFT] += this.lineSpace;
		}
		if (lastPathLocation[1] < outputXY[1]) {
			nodeBumps[blockingNodeId][UP] += this.lineSpace;
		} else {
			nodeBumps[blockingNodeId][DOWN] += this.lineSpace;
		}
	}

	getRouteVert(
		blockingLinesArea: BoundingBox,
		outputXY: Point,
		inputXY: Point
	) {
		const vertDistance = inputXY[1] - outputXY[1];

		const vertEdgeY =
			vertDistance <= 0 ? blockingLinesArea[DOWN] : blockingLinesArea[UP];
		const pathAvoidNode = [
			[outputXY[0], outputXY[1]],
			[outputXY[0], vertEdgeY],
		] as Point[];

		const horzDistanceViaBlockLeft =
			Math.abs(inputXY[0] - blockingLinesArea[LEFT]) +
			Math.abs(outputXY[0] - blockingLinesArea[LEFT]);
		const horzDistanceViaBlockRight =
			Math.abs(inputXY[0] - blockingLinesArea[RIGHT]) +
			Math.abs(outputXY[0] - blockingLinesArea[RIGHT]);

		const lastPathLocation = [
			horzDistanceViaBlockLeft <= horzDistanceViaBlockRight
				? blockingLinesArea[LEFT]
				: blockingLinesArea[RIGHT],
			vertEdgeY,
		] as Point;
		const unblockNotPossible = this.testPath([
			...pathAvoidNode,
			lastPathLocation,
		]);
		return {
			unblockNotPossible,
			lastPathLocation,
			pathAvoidNode,
		};
	}

	adjustBlockingLinesAreaVert(
		vertDistance: number,
		blockingNodeId: string | number,
		outputXY: Point,
		nodeBumps: Record<number | string, number[]>,
		lastPathLocation: Point
	) {
		nodeBumps[blockingNodeId] = nodeBumps[blockingNodeId] || [0, 0, 0, 0];
		if (vertDistance <= 0) {
			nodeBumps[blockingNodeId][DOWN] += this.lineSpace;
		} else {
			nodeBumps[blockingNodeId][UP] += this.lineSpace;
		}
		if (lastPathLocation[0] < outputXY[0]) {
			nodeBumps[blockingNodeId][LEFT] += this.lineSpace;
		} else {
			nodeBumps[blockingNodeId][RIGHT] += this.lineSpace;
		}
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

	mapLinks(nodesByExecution: LGraphNode[]) {
		if (!this.canvas.graph.links) {
			console.error("Missing graph.links", this.canvas.graph); // eslint-disable-line no-console
			return;
		}

		const startCalcTime = new Date().getTime();

		this.nodesByRight = [];
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
		//
		this.nodesByRight.sort((a, b) => a.area[UP] - b.area[UP]);

		for (const { node } of this.nodesByRight) {
			if (!node.outputs) {
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

		outputXY[0] = outputNodeInfo.linesArea[RIGHT] + 1;
		inputXY[0] = targetNodeInfo.linesArea[LEFT] - 1;

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
				this.expandTargetNodeLinesArea(targetNodeInfo, path);
			}
		}
		if (!path) {
			path = [outputXYConnection, outputXY, inputXY, inputXYConnection];
		}
		this.expandSourceNodeLinesArea(outputNodeInfo, path);
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

			if (this.debug || true) {
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

		ctx.lineWidth = 1;
		ctx.lineStyle = "#00ff00";
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

		ctx.restore();
	}
}

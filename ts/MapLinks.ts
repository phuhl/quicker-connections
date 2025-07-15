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
import { findClippedNode } from "./utils/findClippedNode.js";
import { drawDebug, RecursiveSearch, GRID_SIZE } from "./RecursiveSearch.js";

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

export class MapLinks {
	private nodesByRight: Node[];
	private nodesById: Record<any, Node>;
	private paths: Record<
		string,
		{
			path: Point[];
			startNode: LGraphNode;
			targetNode: LGraphNode;
			startSlot: number;
		}
	>;
	private lineSpace: number;
	private lineRadius: number;
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
		this.paths = {};
		this.lineSpace = GRID_SIZE;
		this.lineRadius = Math.floor(LiteGraph.NODE_SLOT_HEIGHT / 2);
		this.maxDirectLineDistance = Number.MAX_SAFE_INTEGER;
		this.debug = false;
	}

	setCtx(ctx: CanvasRenderingContext2D) {
		this.ctx = ctx;
	}

	mapLink(outputXY: Point, inputXY: Point) {
		this.ctx.save();
		const search = new RecursiveSearch(
			outputXY,
			inputXY,
			this.nodesByRight
			//			this.ctx
		);
		const path = search.run() || ([outputXY, inputXY] as Point[]);
		this.ctx.restore();

		const touchedNodes = new Set<string>();
		for (const node of this.nodesByRight) {
			for (let i = 0; i < path.length - 1; i++) {
				const pathPoint1 = path[i],
					pathPoint2 = path[i + 1];
				const [left, up, right, down] = node.linesArea;
				const horizontal = pathPoint1[1] === pathPoint2[1];
				if (horizontal) {
					const pathStart =
						pathPoint1[0] < pathPoint2[0] ? pathPoint1 : pathPoint2;
					const pathEnd =
						pathPoint1[0] < pathPoint2[0] ? pathPoint2 : pathPoint1;

					if (pathEnd[0] >= left && pathStart[0] <= right) {
						if (pathStart[1] <= up && pathStart[1] > up - this.lineSpace) {
							node.linesArea[UP] -= this.lineSpace;
							touchedNodes.add(String(node.node.id));
						}
						if (pathEnd[1] >= down && pathEnd[1] < down + this.lineSpace) {
							node.linesArea[DOWN] += this.lineSpace;
							touchedNodes.add(String(node.node.id));
						}
					}
				} else {
					const pathStart =
						pathPoint1[1] < pathPoint2[1] ? pathPoint1 : pathPoint2;
					const pathEnd =
						pathPoint1[1] < pathPoint2[1] ? pathPoint2 : pathPoint1;

					if (pathEnd[1] >= up && pathStart[1] <= down) {
						if (pathStart[0] <= left && pathStart[0] > left - this.lineSpace) {
							node.linesArea[LEFT] -= this.lineSpace;
							touchedNodes.add(String(node.node.id));
						}
						if (pathEnd[0] >= right && pathEnd[0] < right + this.lineSpace) {
							node.linesArea[RIGHT] += this.lineSpace;
							touchedNodes.add(String(node.node.id));
						}
					}
				}
			}
		}

		return { path, touchedNodes };
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
	private linkTouchesNode: Record<string, string[]> = {};

	mapLinks(nodesByExecution: LGraphNode[]) {
		if (!this.canvas.graph.links) {
			console.error("Missing graph.links", this.canvas.graph); // eslint-disable-line no-console
			return;
		}

		const startCalcTime = new Date().getTime();

		this.parseNodes(nodesByExecution);

		const changedNodes = this.updateNodes();
		if (changedNodes.size > 0) {
			console.log("changed nodes", changedNodes); // eslint-disable-line no-console
		}

		const changedLinks = this.updateLinks();

		// - remove nodes that are not in the graph anymore from previousNodePositions
		// - remove links that are not in the graph anymore from previousLinks
		// - check if node positions have changed, if so, add to nodeIdsChanged
		// - check if links have changed, if so, add to linkIdsChanged
		// - get all links from changed nodes
		// - get all nodes from changed links, also using linkTouchesNode

		const linkIdsFromNodes = this.getLinksFromNodes(changedNodes);
		const nodesToBeUpdated = this.getTouchedNodes(linkIdsFromNodes)
			.union(this.getNodesFromLinks(changedLinks))
			.union(this.getNodesFromLinks(linkIdsFromNodes));

		for (const { node } of this.nodesByRight) {
			if (!node.outputs || !nodesToBeUpdated.has(String(node.id))) {
				continue;
			}
			for (const input of node.inputs) {
				if (!input.link) {
					continue;
				}
				this.definePathForLink(input.link);
			}
		}
		this.lastCalculate = new Date().getTime();
		this.lastCalcTime = this.lastCalculate - startCalcTime;

		if (this.debug) console.log("last calc time", this.lastCalcTime); // eslint-disable-line no-console
	}

	parseNodes(nodes: LGraphNode[]) {
		this.nodesById = {};
		this.nodesByRight = nodes.map((node) => {
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
	}

	updateNodes() {
		const nodeIdsChanged = new Set<string>();

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
		return nodeIdsChanged;
	}

	updateLinks() {
		const linkIdsChanged = new Set<string>();
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
				delete this.linkTouchesNode[link];
				delete this.paths[link];
			}
		}
		return linkIdsChanged;
	}

	getLinksFromNodes(nodeIds: Set<string>) {
		const linkIds = new Set<string>();
		// all links that are in/outputs of the nodes
		for (const node of nodeIds) {
			if (this.nodesById[node]) {
				for (const links of (this.nodesById[node].node.outputs ?? []).map(
					(o) => o.links ?? []
				)) {
					for (const link of links) {
						linkIds.add(String(link));
					}
				}
				for (const link of (this.nodesById[node].node.inputs ?? []).map(
					(o) => o.link
				)) {
					linkIds.add(String(link));
				}
			}
		}

		// all links that go through the nodes
		const nodes = Array.from(nodeIds)
			.map((id) => this.nodesById[id])
			.filter(Boolean);
		for (const key in this.paths) {
			const { path } = this.paths[key];
			for (let i = 0; i < path.length - 1; i++) {
				const clippingRes = findClippedNode(path[i], path[i + 1], nodes);
				if (clippingRes.clipped) {
					linkIds.add(key);
				}
			}
		}

		return linkIds;
	}

	getNodesFromLinks(linkIds: Set<string>) {
		const nodeIds = new Set<string>();
		for (const linkId of linkIds) {
			const link = this.canvas.graph?.links[linkId];
			if (link) {
				nodeIds.add(String(link.origin_id));
				nodeIds.add(String(link.target_id));
			}
		}
		return nodeIds;
	}

	getTouchedNodes(linkIds: Set<string>) {
		const nodeIds = new Set<string>();
		for (const link of linkIds) {
			for (const node of this.linkTouchesNode[link] ?? []) {
				nodeIds.add(String(node));
			}
		}
		return nodeIds;
	}

	definePathForLink(linkId: number) {
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

		outputXY[0] =
			Math.ceil(outputNodeInfo.linesArea[RIGHT] / GRID_SIZE) * GRID_SIZE;
		inputXY[0] =
			Math.floor(targetNodeInfo.linesArea[LEFT] / GRID_SIZE) * GRID_SIZE;

		const inputBlockedByNode = this.getNodeOnPos(inputXY);
		const outputBlockedByNode = this.getNodeOnPos(outputXY);

		let path = null as Point[] | null;

		if (!inputBlockedByNode && !outputBlockedByNode) {
			const { path: pathFound, touchedNodes } = this.mapLink(outputXY, inputXY);
			this.linkTouchesNode[linkId] = Array.from(touchedNodes);
			if (pathFound && pathFound.length > 2) {
				path = [outputXYConnection, ...pathFound, inputXYConnection];
			}
		} else {
			this.linkTouchesNode[linkId] = [];
		}
		if (!path) {
			path = [outputXYConnection, outputXY, inputXY, inputXYConnection];
		}
		this.paths[linkId] = {
			path: path as Point[],
			startNode: sourceNode,
			targetNode,
			startSlot: link.origin_slot,
		};
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

		for (const key in this.paths) {
			const pathI = this.paths[key];
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
			const cornerRadius = this.lineRadius;

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
		}

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

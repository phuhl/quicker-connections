import { DOWN, LEFT, RIGHT, UP, } from "./utils/types.js";
import { findClippedNode } from "./utils/findClippedNode.js";
import { RecursiveSearch, GRID_SIZE } from "./RecursiveSearch.js";
const normalizeVector = (v) => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
    if (len === 0) {
        return [0, 0];
    }
    return [v[0] / len, v[1] / len];
};
const vectorAdd = (a, b) => {
    return [a[0] + b[0], a[1] + b[1]];
};
const vectorMult = (a, b) => {
    return [a[0] * b, a[1] * b];
};
const getVectorDist = (a, b) => {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
};
export class MapLinks {
    canvas;
    ctx;
    nodes;
    nodesById;
    paths;
    lineSpace;
    nodeNeighborDist;
    lineRadius;
    maxDirectLineDistance;
    debug;
    lastCalcTime = 0;
    lastCalculate;
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.nodes = [];
        this.nodesById = {};
        this.paths = {};
        this.lineSpace = GRID_SIZE;
        this.nodeNeighborDist = this.lineSpace * 8;
        this.lineRadius = Math.floor(LiteGraph.NODE_SLOT_HEIGHT / 2);
        this.maxDirectLineDistance = Number.MAX_SAFE_INTEGER;
        this.debug = false;
    }
    setCtx(ctx) {
        this.ctx = ctx;
    }
    mapLink(outputXY, inputXY, source, target, link) {
        this.ctx.save();
        const paths = Object.keys(this.paths)
            .filter((path) => (this.paths[path].sourceNode.id !== source.node.id ||
            this.paths[path].sourceSlot !== link.origin_slot) &&
            (this.paths[path].targetNode.id !== target.node.id ||
                this.paths[path].targetSlot !== link.target_slot))
            .map((key) => this.paths[key].path);
        const search = new RecursiveSearch(outputXY, inputXY, this.nodes, paths, this.ctx);
        try {
            return search.run() ?? [outputXY, inputXY];
        }
        catch (e) {
            console.log("Error in RecursiveSearch", e);
        }
        finally {
            this.ctx.restore();
        }
        // const touchedNodes = new Set<string>();
        // for (const node of this.nodesByRight) {
        // 	for (let i = 0; i < path.length - 1; i++) {
        // 		const pathPoint1 = path[i],
        // 			pathPoint2 = path[i + 1];
        // 		const [left, up, right, down] = node.linesArea;
        // 		const horizontal = pathPoint1[1] === pathPoint2[1];
        // 		if (horizontal) {
        // 			const pathStart =
        // 				pathPoint1[0] < pathPoint2[0] ? pathPoint1 : pathPoint2;
        // 			const pathEnd =
        // 				pathPoint1[0] < pathPoint2[0] ? pathPoint2 : pathPoint1;
        // 			if (pathEnd[0] >= left && pathStart[0] <= right) {
        // 				if (pathStart[1] <= up && pathStart[1] > up - this.lineSpace) {
        // 					if (pathStart[1] > up - this.lineSpace) {
        // 						node.linesArea[UP] -= this.lineSpace;
        // 					}
        // 					if (pathStart[1] > up - this.nodeNeighborDist) {
        // 						touchedNodes.add(String(node.node.id));
        // 					}
        // 				}
        // 				if (pathEnd[1] >= down) {
        // 					if (pathEnd[1] < down + this.lineSpace) {
        // 						node.linesArea[DOWN] += this.lineSpace;
        // 					}
        // 					if (pathEnd[1] < down + this.nodeNeighborDist) {
        // 						touchedNodes.add(String(node.node.id));
        // 					}
        // 				}
        // 			}
        // 		} else {
        // 			const pathStart =
        // 				pathPoint1[1] < pathPoint2[1] ? pathPoint1 : pathPoint2;
        // 			const pathEnd =
        // 				pathPoint1[1] < pathPoint2[1] ? pathPoint2 : pathPoint1;
        // 			if (pathEnd[1] >= up && pathStart[1] <= down) {
        // 				if (pathStart[0] <= left) {
        // 					if (pathStart[0] > left - this.lineSpace) {
        // 						node.linesArea[LEFT] -= this.lineSpace;
        // 					}
        // 					if (pathStart[0] > left - this.nodeNeighborDist) {
        // 						touchedNodes.add(String(node.node.id));
        // 					}
        // 				}
        // 				if (pathEnd[0] >= right) {
        // 					if (pathEnd[0] < right + this.lineSpace) {
        // 						node.linesArea[RIGHT] += this.lineSpace;
        // 					}
        // 					if (pathEnd[0] < right + this.nodeNeighborDist) {
        // 						touchedNodes.add(String(node.node.id));
        // 					}
        // 				}
        // 			}
        // 		}
        // 	}
        // }
    }
    getNodeOnPos(xy) {
        for (let i = 0; i < this.nodes.length; ++i) {
            const nodeI = this.nodes[i];
            const { area } = nodeI;
            if (xy[0] > area[0] &&
                xy[1] > area[1] &&
                xy[0] < area[2] &&
                xy[1] < area[3]) {
                return nodeI;
            }
        }
        return null;
    }
    previousNodePositions = {};
    previousLinks = {};
    mapLinks(nodesByExecution) {
        if (!this.canvas.graph.links) {
            console.error("Missing graph.links", this.canvas.graph); // eslint-disable-line no-console
            return;
        }
        const startCalcTime = new Date().getTime();
        this.parseNodes(nodesByExecution);
        const changedNodes = this.updateNodes();
        const changedLinks = this.updateLinks();
        if (changedNodes.size === 0 && changedLinks.size === 0) {
            return;
        }
        // - remove nodes that are not in the graph anymore from previousNodePositions
        // - remove links that are not in the graph anymore from previousLinks
        // - check if node positions have changed, if so, add to nodeIdsChanged
        // - check if links have changed, if so, add to linkIdsChanged
        // - get all links from changed nodes
        // - get all nodes from changed links, also using linkTouchesNode
        const linkIdsFromNodes = this.getLinksFromNodes(changedNodes);
        const nodesToBeUpdated = this.getNodesFromLinks(changedLinks).union(this.getNodesFromLinks(linkIdsFromNodes));
        for (const { node } of this.nodes) {
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
        if (this.debug)
            console.log("last calc time", this.lastCalcTime); // eslint-disable-line no-console
    }
    parseNodes(nodes) {
        this.nodesById = {};
        this.nodes = nodes.map((node) => {
            const bArea = new Float32Array(4);
            node.getBounding(bArea);
            const area = [
                (Math.floor(bArea[0] / GRID_SIZE) - 1) * GRID_SIZE + 1,
                (Math.floor(bArea[1] / GRID_SIZE) - 1) * GRID_SIZE + 1,
                (Math.ceil((bArea[0] + bArea[2]) / GRID_SIZE) + 1) * GRID_SIZE - 1,
                (Math.ceil((bArea[1] + bArea[3]) / GRID_SIZE) + 1) * GRID_SIZE - 1,
            ];
            const obj = {
                node,
                area,
            };
            this.nodesById[node.id] = obj;
            return obj;
        });
        this.nodes.sort((a, b) => a.area[UP] - b.area[UP]);
    }
    updateNodes() {
        const nodeIdsChanged = new Set();
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
            if (this.previousNodePositions[id][0] !== this.nodesById[id].area[0] ||
                this.previousNodePositions[id][1] !== this.nodesById[id].area[1] ||
                this.previousNodePositions[id][2] !== this.nodesById[id].area[2] ||
                this.previousNodePositions[id][3] !== this.nodesById[id].area[3]) {
                nodeIdsChanged.add(id);
                this.previousNodePositions[id] = this.nodesById[id].area;
            }
        }
        return nodeIdsChanged;
    }
    updateLinks() {
        const linkIdsChanged = new Set();
        for (const link in this.canvas.graph?.links) {
            const linkData = this.canvas.graph.links[link];
            if (!linkData) {
                continue;
            }
            if (!this.previousLinks[link] ||
                this.previousLinks[link][0] !== String(linkData.origin_id) ||
                this.previousLinks[link][1] !== String(linkData.target_id)) {
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
                delete this.paths[link];
            }
        }
        return linkIdsChanged;
    }
    getLinksFromNodes(nodeIds) {
        const linkIds = new Set();
        // all links that are in/outputs of the nodes
        for (const node of nodeIds) {
            if (this.nodesById[node]) {
                for (const links of (this.nodesById[node].node.outputs ?? []).map((o) => o.links ?? [])) {
                    for (const link of links) {
                        if (link) {
                            linkIds.add(String(link));
                        }
                    }
                }
                for (const link of (this.nodesById[node].node.inputs ?? []).map((o) => o.link)) {
                    if (link) {
                        linkIds.add(String(link));
                    }
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
    getNodesFromLinks(linkIds) {
        const nodeIds = new Set();
        for (const linkId of linkIds) {
            const link = this.canvas.graph?.links[linkId];
            if (link) {
                nodeIds.add(String(link.origin_id));
                nodeIds.add(String(link.target_id));
            }
        }
        return nodeIds;
    }
    definePathForLink(linkId) {
        const link = this.canvas.graph?.links[linkId];
        const sourceNode = link && this.canvas.graph?.getNodeById(link.origin_id);
        const targetNode = link && this.canvas.graph?.getNodeById(link.target_id);
        if (!link || !sourceNode || !targetNode) {
            return;
        }
        delete this.paths[linkId];
        const outputXYConnection = sourceNode.getOutputPos(link.origin_slot);
        const outputNodeInfo = this.nodesById[sourceNode.id];
        let outputXY = Array.from(outputXYConnection);
        const inputXYConnection = targetNode.getInputPos(link.target_slot);
        const inputXY = Array.from(inputXYConnection);
        const targetNodeInfo = this.nodesById[targetNode.id];
        outputXY[0] = Math.ceil(outputNodeInfo.area[RIGHT] / GRID_SIZE) * GRID_SIZE;
        inputXY[0] = Math.floor(targetNodeInfo.area[LEFT] / GRID_SIZE) * GRID_SIZE;
        const inputBlockedByNode = this.getNodeOnPos(inputXY);
        const outputBlockedByNode = this.getNodeOnPos(outputXY);
        let path = null;
        if (!inputBlockedByNode && !outputBlockedByNode) {
            const pathFound = this.mapLink(outputXY, inputXY, outputNodeInfo, targetNodeInfo, link);
            if (pathFound && pathFound.length > 2) {
                path = [outputXYConnection, ...pathFound, inputXYConnection];
            }
        }
        if (!path) {
            path = [outputXYConnection, outputXY, inputXY, inputXYConnection];
        }
        this.paths[linkId] = {
            path: path,
            startNode: sourceNode,
            sourceNode,
            targetNode,
            sourceSlot: link.origin_slot,
            targetSlot: link.target_slot,
        };
        outputXY = [outputXY[0] + this.lineSpace, outputXY[1]];
    }
    drawLinks(ctx) {
        if (!this.canvas.default_connection_color_byType ||
            !this.canvas.default_connection_color) {
            console.error("Missing canvas.default_connection_color_byType", this.canvas); // eslint-disable-line no-console
            return;
        }
        if (this.debug)
            console.log("paths", this.paths); // eslint-disable-line no-console
        ctx.save();
        const currentNodeIds = this.canvas.selected_nodes || {};
        const corners = [];
        for (const key in this.paths) {
            const pathI = this.paths[key];
            const path = pathI.path;
            if (path.length <= 1) {
                return;
            }
            const connection = pathI.startNode.outputs[pathI.sourceSlot];
            ctx.beginPath();
            const slotColor = this.canvas.default_connection_color_byType[connection.type] ||
                this.canvas.default_connection_color.input_on;
            if (currentNodeIds[pathI.startNode.id] ||
                currentNodeIds[pathI.targetNode.id]) {
                ctx.strokeStyle = "white";
            }
            else {
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
                const beforeCorner = vectorAdd(cornerPos, vectorMult(directionBeforeCorner, -1 * Math.min(cornerRadius, dist1 / 2)));
                const afterCorner = vectorAdd(cornerPos, vectorMult(directionAfterCorner, Math.min(cornerRadius, dist2 / 2)));
                ctx.lineTo(beforeCorner[0], beforeCorner[1]);
                ctx.quadraticCurveTo(cornerPos[0], cornerPos[1], afterCorner[0], afterCorner[1]);
            }
            ctx.stroke();
            ctx.closePath();
            if (this.debug || true) {
                for (let p = 0; p < path.length - 1; ++p) {
                    const pos = path[p];
                    ctx.fillStyle = "#ff00ff";
                    ctx.beginPath();
                    ctx.rect(pos[0] - this.lineSpace / 4, pos[1] - this.lineSpace / 4, this.lineSpace / 2, this.lineSpace / 2);
                    ctx.fill();
                }
            }
        }
        if (this.debug || true) {
            for (const node of this.nodes) {
                ctx.strokeStyle = "#030";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.rect(node.area[LEFT], node.area[UP], node.area[RIGHT] - node.area[LEFT], node.area[DOWN] - node.area[UP]);
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
            this.nodes.filter((nodeI) => {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "#000080";
                ctx.beginPath();
                ctx.rect(nodeI.area[0], nodeI.area[1], nodeI.area[2] - nodeI.area[0], nodeI.area[3] - nodeI.area[1]);
                ctx.stroke();
                ctx.closePath();
                return false;
            });
        }
        //		drawDebug(ctx);
        ctx.restore();
    }
}

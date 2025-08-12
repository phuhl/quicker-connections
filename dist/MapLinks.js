import { DOWN, LEFT, RIGHT, UP, } from "./utils/types.js";
import { findClippedNode } from "./utils/findClippedNode.js";
import { RecursiveSearch, GRID_SIZE } from "./RecursiveSearch.js";
import { hexToRGB, HSLToRGB, rgbToHex, RGBToHSL } from "./utils/colors.js";
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
    maxTime = 0;
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
        const search = new RecursiveSearch(outputXY, inputXY, this.nodes, paths
        //			this.ctx
        );
        try {
            return search.run() ?? [outputXY, inputXY];
        }
        catch (e) {
            console.log("Error in RecursiveSearch", e);
        }
        finally {
            this.ctx.restore();
        }
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
    pathsToBeChecked = new Set();
    timeout = null;
    // - remove nodes that are not in the graph anymore from previousNodePositions
    // - remove links that are not in the graph anymore from previousLinks
    // - check if node positions have changed, if so, add to nodeIdsChanged
    // - check if links have changed, if so, add to linkIdsChanged
    // - get all links from changed nodes
    // - get all nodes from changed links, also using linkTouchesNode
    mapLinks(nodesByExecution, rerun = false) {
        if (!this.canvas.graph.links) {
            console.error("Missing graph.links", this.canvas.graph); // eslint-disable-line no-console
            return;
        }
        const startCalcTime = Date.now();
        clearTimeout(this.timeout);
        if (!rerun) {
            this.maxTime = 0;
            this.parseNodes(nodesByExecution);
            const changedNodes = this.updateNodes();
            const changedLinks = this.updateLinks();
            if (changedNodes.size !== 0 || changedLinks.size !== 0) {
                const prevPathsToBeChecked = this.pathsToBeChecked;
                this.pathsToBeChecked = new Set();
                const linkIdsFromNodes = this.getLinksFromNodes(changedNodes).union(changedLinks);
                // Insert these first so they get calculated first
                for (const id of linkIdsFromNodes) {
                    this.pathsToBeChecked.add(id);
                    this.definePathForLink(id, true);
                }
                // find all links within the area of the changed links and
                // recalculate them to fix missing links and improve suboptimal paths
                const bbox = this.getBoundingBoxArroundLinks(linkIdsFromNodes);
                const pathsInArea = this.getLinksInArea(bbox);
                for (const id in pathsInArea) {
                    this.pathsToBeChecked.add(id);
                }
                this.pathsToBeChecked =
                    this.pathsToBeChecked.union(prevPathsToBeChecked);
            }
        }
        if (this.pathsToBeChecked.size === 0) {
            return;
        }
        while (Date.now() - startCalcTime < 5 && this.pathsToBeChecked.size > 0) {
            const link = this.pathsToBeChecked.values().next().value;
            this.pathsToBeChecked.delete(link);
            this.definePathForLink(link);
        }
        if (this.pathsToBeChecked.size !== 0) {
            this.timeout = setTimeout(() => this.mapLinks(nodesByExecution, true), 0);
        }
        this.lastCalculate = new Date().getTime();
        this.lastCalcTime = this.lastCalculate - startCalcTime;
        if (this.maxTime < this.lastCalcTime) {
            this.maxTime = this.lastCalcTime;
        }
        if (this.debug)
            console.log("last calc time", this.lastCalcTime); // eslint-disable-line no-console
    }
    getBoundingBoxArroundLinks(linkIds) {
        const boundingBox = [
            Number.MAX_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            Number.MIN_SAFE_INTEGER,
            Number.MIN_SAFE_INTEGER,
        ];
        for (const linkId of linkIds) {
            const path = this.paths[linkId];
            if (!path) {
                continue;
            }
            const area = path.bbox;
            boundingBox[LEFT] = Math.min(area[LEFT], boundingBox[LEFT]);
            boundingBox[UP] = Math.min(area[UP], boundingBox[UP]);
            boundingBox[RIGHT] = Math.max(area[RIGHT], boundingBox[RIGHT]);
            boundingBox[DOWN] = Math.max(area[DOWN], boundingBox[DOWN]);
        }
        return boundingBox;
    }
    getLinksInArea(area) {
        const linksInArea = new Set();
        for (const path in this.paths) {
            const pathArea = this.paths[path].bbox;
            if (pathArea[LEFT] < area[RIGHT] &&
                pathArea[RIGHT] > area[LEFT] &&
                pathArea[UP] < area[DOWN] &&
                pathArea[DOWN] > area[UP]) {
                linksInArea.add(path);
            }
        }
        return linksInArea;
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
            const actualArea = [
                bArea[0],
                bArea[1],
                bArea[0] + bArea[2],
                bArea[1] + bArea[3],
            ];
            const obj = {
                node,
                area,
                actualArea,
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
    definePathForLink(linkId, fast = false) {
        const link = this.canvas.graph?.links[linkId];
        const sourceNode = link && this.canvas.graph?.getNodeById(link.origin_id);
        const targetNode = link && this.canvas.graph?.getNodeById(link.target_id);
        delete this.paths[linkId];
        if (!link ||
            !sourceNode ||
            !targetNode ||
            !this.nodesById[sourceNode.id] ||
            !this.nodesById[targetNode.id]) {
            return;
        }
        const hasOutput = sourceNode.outputs?.some((l) => l.links?.some((l) => String(l) === linkId));
        if (!hasOutput) {
            return;
        }
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
        if (!inputBlockedByNode && !outputBlockedByNode && !fast) {
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
            bbox: [
                Math.min(outputXY[0], inputXY[0]),
                Math.min(outputXY[1], inputXY[1]),
                Math.max(outputXY[0], inputXY[0]),
                Math.max(outputXY[1], inputXY[1]),
            ],
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
            const pathIsActive = currentNodeIds[pathI.startNode.id] ||
                currentNodeIds[pathI.targetNode.id];
            if (path.length <= 1) {
                return;
            }
            const connection = pathI.startNode.outputs[pathI.sourceSlot];
            ctx.beginPath();
            let slotColor = this.canvas.default_connection_color_byType[connection.type] ||
                this.canvas.default_connection_color.input_on;
            if (pathIsActive) {
                const hsl = RGBToHSL(...hexToRGB(slotColor.toString()));
                hsl[2] = 85;
                hsl[1] = Math.min(hsl[1] + 0.2, 100);
                slotColor = rgbToHex(...HSLToRGB(...hsl));
            }
            ctx.strokeStyle = slotColor;
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
            if (this.debug) {
                for (let p = 0; p < path.length - 1; ++p) {
                    const pos = path[p];
                    ctx.fillStyle = "#ff00ff";
                    ctx.beginPath();
                    ctx.rect(pos[0] - this.lineSpace / 4, pos[1] - this.lineSpace / 4, this.lineSpace / 2, this.lineSpace / 2);
                    ctx.fill();
                }
            }
        }
        for (const key in this.paths) {
            const pathI = this.paths[key];
            const path = pathI.path;
            const pathIsActive = currentNodeIds[pathI.startNode.id] ||
                currentNodeIds[pathI.targetNode.id];
            const sourceIsActive = currentNodeIds[pathI.startNode.id];
            const selectedNodeIsCollapsed = this.nodesById[Object.values(currentNodeIds)[0]?.id]?.node?.collapsed;
            if (!pathIsActive ||
                selectedNodeIsCollapsed ||
                Object.keys(currentNodeIds).length > 1) {
                continue;
            }
            const connection = pathI.startNode.outputs[pathI.sourceSlot];
            const origSlotColor = this.canvas.default_connection_color_byType[connection.type] ||
                this.canvas.default_connection_color.input_on;
            const hsl = RGBToHSL(...hexToRGB(origSlotColor.toString()));
            hsl[2] = 85;
            hsl[1] = Math.min(hsl[1] + 0.2, 100);
            const slotColor = rgbToHex(...HSLToRGB(...hsl));
            hsl[2] = 20;
            const textColor = rgbToHex(...HSLToRGB(...hsl));
            const arcR = 7, dist = 15, distEnd = 15;
            const pathStart = path[0];
            const pathEnd = path[path.length - 1];
            const sourceArea = this.nodesById[pathI.sourceNode.id].actualArea;
            const targetArea = this.nodesById[pathI.targetNode.id].actualArea;
            ctx.fillStyle = slotColor;
            ctx.beginPath();
            ctx.arc(sourceArea[RIGHT] + dist, pathStart[1], arcR, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(targetArea[LEFT] - distEnd, pathEnd[1], arcR, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = slotColor;
            ctx.beginPath();
            ctx.moveTo(pathStart[0], pathStart[1]);
            ctx.lineTo(sourceArea[RIGHT] + dist, pathStart[1]);
            ctx.stroke();
            ctx.closePath();
            ctx.beginPath();
            ctx.moveTo(pathEnd[0], pathEnd[1]);
            ctx.lineTo(targetArea[LEFT] - dist, pathEnd[1]);
            ctx.stroke();
            ctx.closePath();
            ctx.fillStyle = textColor;
            ctx.font = "10px Arial";
            ctx.textAlign = "center";
            ctx.fillText(((sourceIsActive ? pathI.sourceSlot : pathI.targetSlot) + 1).toString(), sourceArea[RIGHT] + dist, pathStart[1] + 4);
            ctx.fillText(((sourceIsActive ? pathI.sourceSlot : pathI.targetSlot) + 1).toString(), targetArea[LEFT] - distEnd, pathEnd[1] + 4);
        }
        if (this.debug) {
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

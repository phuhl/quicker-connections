import {
	BoundingBox,
	DOWN,
	LEFT,
	Node,
	Point,
	RIGHT,
	UP,
} from "./utils/types.js";
import { findClippedNode } from "./utils/findClippedNode.js";

export const GRID_SIZE = 5;
const WRONG_DIR_MAX_DIST = GRID_SIZE * 60;
const CANDIDATS_ON_LINE_OVERSHOOT = GRID_SIZE * 20;
const MAX_DIST_NODE = GRID_SIZE * 20;
const MAX_DIST_PATH = GRID_SIZE * 20;
const MAX_ITERATIONS = 10;
const CORNER_PRICE = 10;
const OVERLAP_PRICE_FACTOR = 50;

const getMnhDist = (a: Point, b: Point) => {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
};

const filterInPlace = <T>(list: T[], filter: (t: T) => boolean) => {
	let i: number, j: number;

	for (i = 0, j = 0; i < list.length; ++i) {
		if (filter(list[i])) {
			list[j] = list[i];
			++j;
		}
	}

	while (j < list.length) {
		list.pop();
	}
};

const filterInPlaceReturnFiltered = <T>(
	list: T[],
	filter: (t: T) => boolean
) => {
	let i: number, j: number;
	const filtered = [] as T[];

	for (i = 0, j = 0; i < list.length; ++i) {
		if (filter(list[i])) {
			list[j] = list[i];
			++j;
		} else {
			filtered.push(list[i]);
		}
	}

	while (j < list.length) {
		list.pop();
	}
	return filtered;
};

type Candidate = {
	key: number;
	keyPrice: number;
	keyFrom: number;
	position: Point;
	positionFrom: Point;
	positionParent?: Point;
	fullyVisited: boolean;
	group?: string;
	targetEstimate: number;
	gridX: number;
	gridY: number;
};

type PrecheckedCandidate = {};

let candidatPosToDraw = [] as Point[];

export class RecursiveSearch {
	gridSpaceUsed = [] as boolean[][];

	positionsVisited = {} as Record<
		number,
		{
			fromKey: number;
			from: Point;
			price: number;
		}
	>;

	candidates = [] as Candidate[];

	targetFoundPrice = Number.MAX_SAFE_INTEGER;

	pathsH: Point[][] = [];
	pathsV: Point[][] = [];

	constructor(
		private startPos: Point,
		private endPos: Point,
		private nodes: Node[],
		paths: Point[][],
		private ctx: CanvasRenderingContext2D | null = null
	) {
		console.log("search");
		for (const path of paths) {
			if (path.length <= 2) {
				continue;
			}
			for (let i = 0; i < path.length - 1; i++) {
				if (path[i][0] === path[i + 1][0]) {
					if (path[i][1] < path[i + 1][1]) {
						this.pathsV.push([path[i], path[i + 1]]);
					} else {
						this.pathsV.push([path[i + 1], path[i]]);
					}
				} else {
					if (path[i][0] < path[i + 1][0]) {
						this.pathsH.push([path[i], path[i + 1]]);
					} else {
						this.pathsH.push([path[i + 1], path[i]]);
					}
				}
			}
		}
	}

	public run(): Point[] | null {
		return this.search(this.startPos);
	}

	private candidatesChecked = 0;
	private search(currentPos: Point): Point[] | null {
		const fakeFirstPos = [currentPos[0] - 1, currentPos[1]] as Point;
		const fakeFirstKey = this.getPointKey(fakeFirstPos);
		this.positionsVisited[fakeFirstKey] = {
			from: fakeFirstPos,
			fromKey: fakeFirstKey,
			price: 0,
		};
		this.addCandidate(fakeFirstPos, currentPos, fakeFirstKey, 0, true);

		let pathFound = false as false | Point[];

		while (
			this.candidates.length > 0 &&
			this.candidatesChecked++ < MAX_ITERATIONS
		) {
			const candidate = this.getBestCandidate();
			this.removedCandidates.push(candidate);
			pathFound = this.findCandidates(candidate) || pathFound;

			if (pathFound) {
				filterInPlace(
					this.candidates,
					(p) =>
						this.positionsVisited[p.keyPrice].price + p.targetEstimate <
						this.targetFoundPrice
				);
			}
		}

		if (this.removedCandidates.length > candidatPosToDraw.length) {
			candidatPosToDraw = [
				currentPos,
				...this.candidates.map((c) => c.position),
				...this.removedCandidates.map((c) => c.position),
				this.endPos,
			];
		}
		return pathFound || null;
	}

	private removedCandidates = [] as Candidate[];
	private highstPriceYet = 0;
	getBestCandidate() {
		let leastPrice = Number.MAX_SAFE_INTEGER,
			leastTargetEstimate = Number.MAX_SAFE_INTEGER,
			bestIndex = -1,
			currentIndex = 0;
		for (const candidate of this.candidates) {
			const price =
				this.positionsVisited[candidate.keyPrice].price +
				candidate.targetEstimate;
			if (
				price === leastPrice &&
				candidate.targetEstimate < leastTargetEstimate
			) {
				leastTargetEstimate = candidate.targetEstimate;
				bestIndex = currentIndex;
			}
			if (price < leastPrice) {
				leastPrice = price;
				leastTargetEstimate = candidate.targetEstimate;
				bestIndex = currentIndex;
			}
			currentIndex++;
		}
		if (leastPrice > this.highstPriceYet) {
			this.highstPriceYet = leastPrice;
		}
		const bestCandidate = this.candidates[bestIndex];
		this.candidates[bestIndex] = this.candidates[this.candidates.length - 1];
		this.removedCandidates.push(this.candidates.pop());
		return bestCandidate;
	}

	findCandidates(currentCandidate: Candidate) {
		const currentPos = currentCandidate.position;

		if (!currentCandidate.fullyVisited) {
			// calculate actual candidats from potential candidat
			// this.gridSpaceUsed[currentCandidate.gridX][currentCandidate.gridY] =
			// 	false;

			this.checkCandidate(
				currentCandidate,
				currentCandidate.positionFrom,
				currentCandidate.position,
				this.positionsVisited[currentCandidate.keyPrice].price
			);
			return false;
		}

		if (currentPos[0] === this.endPos[0] && currentPos[1] === this.endPos[1]) {
			this.targetFoundPrice = Math.min(
				this.targetFoundPrice,
				this.positionsVisited[currentCandidate.keyPrice].price
			);
			if (
				this.positionsVisited[currentCandidate.keyPrice].price ===
				this.targetFoundPrice
			) {
				return this.constructPath(currentPos);
			}
			return false;
		}

		const dirX = Math.sign(this.endPos[0] - currentPos[0]);
		const dirY = Math.sign(this.endPos[1] - currentPos[1]);
		const oneAxisAligned =
			this.endPos[0] === currentPos[0] || this.endPos[1] === currentPos[1];
		const candidates = oneAxisAligned
			? ([
					this.endPos[0] === currentPos[0]
						? [currentPos[0], this.endPos[1]]
						: [this.endPos[0], currentPos[1]],
					[currentPos[0], currentPos[1] + WRONG_DIR_MAX_DIST],
					[currentPos[0] + WRONG_DIR_MAX_DIST, currentPos[1]],
					[currentPos[0], currentPos[1] - WRONG_DIR_MAX_DIST],
					[currentPos[0] - WRONG_DIR_MAX_DIST, currentPos[1]],
			  ] as Point[])
			: ([
					[this.endPos[0], currentPos[1]],
					[currentPos[0], this.endPos[1]],
					[currentPos[0], currentPos[1] - WRONG_DIR_MAX_DIST * dirY],
					[currentPos[0] - WRONG_DIR_MAX_DIST * dirX, currentPos[1]],
			  ] as Point[]);

		for (const parentCandidate of candidates) {
			const parentKey = this.getPointKey(parentCandidate);
			const parentEstimate =
				getMnhDist(currentPos, parentCandidate) +
				getMnhDist(parentCandidate, this.endPos) +
				(parentCandidate[0] === this.endPos[0] ? 0 : CORNER_PRICE) +
				(parentCandidate[1] === this.endPos[1] ? 0 : CORNER_PRICE);
			if (
				this.positionsVisited[parentKey] &&
				this.positionsVisited[parentKey].price <= parentEstimate
			) {
				continue;
			}

			const candidates = this.findCandidatesOnLine(currentPos, parentCandidate);
			for (const candidate of candidates) {
				this.addCandidate(
					currentPos,
					candidate,
					this.positionsVisited[currentCandidate.keyPrice].fromKey,
					this.positionsVisited[currentCandidate.keyPrice].price,
					false,
					{
						group: currentCandidate.key + ";" + parentKey,
						positionParent: parentCandidate,
						keyPrice: currentCandidate.key,
						targetEstimate:
							getMnhDist(currentPos, candidate) +
							(currentCandidate.positionFrom[0] === candidate[0] ||
							currentCandidate.positionFrom[1] === candidate[1]
								? 0
								: CORNER_PRICE) +
							this.getTargetEstimate(
								candidate,
								this.positionsVisited[currentCandidate.keyPrice].fromKey
							),
					}
				);
			}
		}

		return false;
	}

	getTargetEstimate(candidatePos: Point, fromKey: number) {
		const positionFrom = this.positionsVisited[fromKey].from;
		const distance = getMnhDist(candidatePos, this.endPos);

		const prevYSame = candidatePos[1] === positionFrom[1];
		const nextYSame = candidatePos[1] === this.endPos[1];

		if (prevYSame) {
			if (nextYSame) {
				return distance;
			} else {
				return distance + CORNER_PRICE * 2;
			}
		} else {
			if (nextYSame) {
				return distance + CORNER_PRICE;
			} else {
				return distance + CORNER_PRICE;
			}
		}
	}

	addCandidate(
		currentPos: Point,
		candidate: Point,
		fromKey: number,
		price: number,
		fullyVisited: boolean,
		candidateVals: Partial<Candidate> = {}
	) {
		const key = this.getPointKey(candidate);
		const gridX = Math.floor(candidate[0] / GRID_SIZE);
		const gridY = Math.floor(candidate[1] / GRID_SIZE);

		if (this.positionsVisited[key]) {
			if (fullyVisited && this.positionsVisited[key].price > price) {
				this.positionsVisited[key] = {
					from: currentPos,
					fromKey: fromKey,
					price,
				};
			} else if (
				!fullyVisited &&
				price + candidateVals.targetEstimate! >= price
			) {
				return false;
			}
			//		return false;
		}

		if (
			fullyVisited &&
			this.gridSpaceUsed[gridX]?.[gridY] &&
			!(candidate[0] === this.endPos[0] && candidate[1] === this.endPos[1])
		) {
			return false;
		}

		if (fullyVisited) {
			this.positionsVisited[key] = {
				from: currentPos,
				fromKey: fromKey,
				price,
			};
			this.gridSpaceUsed[gridX] = this.gridSpaceUsed[gridX] || [];
			this.gridSpaceUsed[gridX][gridY] = true;
		}
		const targetEstimate = this.getTargetEstimate(candidate, fromKey);
		(candidate[0] === this.endPos[0] ? 0 : CORNER_PRICE) +
			(candidate[1] === this.endPos[1] ? 0 : CORNER_PRICE);
		const candidateObj = {
			gridX,
			gridY,
			key,
			keyPrice: key,
			keyFrom: fromKey,
			position: candidate,
			fullyVisited,
			positionFrom: currentPos,
			targetEstimate,
			...candidateVals,
		};
		this.candidates.push(candidateObj);

		if (this.ctx) {
			const currentlyCheaper = price + targetEstimate < this.highstPriceYet;
			const isTarget =
				candidate[0] === this.endPos[0] && candidate[1] === this.endPos[1];
			this.ctx.beginPath();
			if (fullyVisited) {
				this.ctx.strokeStyle = "#ff0000";
				this.ctx.lineWidth = 2;
				this.ctx.moveTo(candidate[0] - 5, candidate[1]);
				this.ctx.lineTo(candidate[0] + 5, candidate[1]);
				this.ctx.moveTo(candidate[0], candidate[1] - 5);
				this.ctx.lineTo(candidate[0], candidate[1] + 5);
				if (currentlyCheaper) {
					this.ctx.fillStyle = "#00ff00";
					this.ctx.fillRect(candidate[0] - 7, candidate[1] - 7, 14, 14);
				}

				this.ctx.beginPath();
				this.ctx.lineWidth = 1;
				this.ctx.moveTo(currentPos[0] - 1, currentPos[1] - 1);
				this.ctx.lineTo(candidate[0] - 1, candidate[1] - 1);
				this.ctx.stroke();

				const text = `${price + targetEstimate}`,
					x = candidate[0] + (isTarget ? -20 : 5),
					y = candidate[1];
				this.ctx.strokeStyle = "white";
				this.ctx.lineWidth = 1;
				this.ctx.strokeText(text, x, y);
				this.ctx.fillStyle = "#ff0000";
				this.ctx.fillText(text, x, y);
			} else {
				this.ctx.strokeStyle = "#f0f000";
				this.ctx.lineWidth = 2;
				this.ctx.moveTo(candidate[0] - 5, candidate[1]);
				this.ctx.lineTo(candidate[0] + 5, candidate[1]);
				this.ctx.moveTo(candidate[0], candidate[1] - 5);
				this.ctx.lineTo(candidate[0], candidate[1] + 5);
				this.ctx.stroke();
				this.ctx.beginPath();
				this.ctx.lineWidth = 1;
				this.ctx.moveTo(currentPos[0] + 1, currentPos[1] + 1);
				this.ctx.lineTo(candidate[0] + 1, candidate[1] + 1);
				this.ctx.stroke();

				const text = `${price + candidateObj.targetEstimate}`,
					x = candidate[0] + (isTarget ? -20 : 5),
					y = candidate[1] + 10;
				this.ctx.strokeStyle = "white";
				this.ctx.lineWidth = 1;
				this.ctx.strokeText(text, x, y);
				this.ctx.fillStyle = "#ff0000";
				this.ctx.fillText(text, x, y);
			}
			const text = `${this.candidatesChecked}`,
				x = candidate[0] - 10,
				y = candidate[1];
			this.ctx.strokeStyle = "white";
			this.ctx.lineWidth = 1;
			this.ctx.strokeText(text, x, y);
			this.ctx.fillStyle = "#ff00ff";
			this.ctx.fillText(text, x, y);
		}

		return true;
	}

	checkCandidate(
		candidate: Candidate,
		currentPos: Point,
		candidatePos: Point,
		price: number
	) {
		const furtherstInGroup = candidate.positionParent;

		// remove all candidates in the same group
		const groupCandidates = filterInPlaceReturnFiltered(
			this.candidates,
			(c) => c.group !== candidate.group
		);
		this.removedCandidates.push(...groupCandidates);
		// for (const removed of groupCandidates) {
		// 	this.gridSpaceUsed[removed.gridX][removed.gridY] = false;
		// }

		groupCandidates.push(candidate);

		const blockingNodeArea = this.testPath(currentPos, furtherstInGroup);
		const horizontal = currentPos[1] === candidatePos[1];
		let blockingNodePos: Point | null = null;
		if (blockingNodeArea) {
			const area = blockingNodeArea;
			// for horizontal LEFT and RIGHT are equal, for vertical UP and DOWN are equal
			blockingNodePos = horizontal
				? [area[LEFT], currentPos[1]]
				: [currentPos[0], area[UP]];

			if (
				blockingNodePos[0] === currentPos[0] &&
				blockingNodePos[1] === currentPos[1]
			) {
				return;
			}

			if (horizontal) {
				const blockingNodeDist = Math.abs(blockingNodePos[0] - currentPos[0]);
				filterInPlace(
					groupCandidates,
					(c) => Math.abs(c.position[0] - currentPos[0]) <= blockingNodeDist
				);
			} else {
				const blockingNodeDist = Math.abs(blockingNodePos[1] - currentPos[1]);
				filterInPlace(
					groupCandidates,
					(c) => Math.abs(c.position[1] - currentPos[1]) <= blockingNodeDist
				);
			}
		}

		const previousPoint = this.positionsVisited[candidate.keyPrice].from;
		let cornerPrice = CORNER_PRICE;
		if (
			!previousPoint ||
			previousPoint[0] === candidatePos[0] ||
			previousPoint[1] === candidatePos[1]
		) {
			cornerPrice = 0;
		}

		const pathPrices = this.getPathPrice(
			currentPos,
			blockingNodePos ? blockingNodePos : candidatePos
		);
		const directionDim = horizontal ? 0 : 1;
		groupCandidates.sort(
			(a, b) =>
				Math.abs(a.position[directionDim] - currentPos[directionDim]) -
				Math.abs(b.position[directionDim] - currentPos[directionDim])
		);
		const forwards = candidatePos[directionDim] > currentPos[directionDim];

		let pathPrice = 0,
			pathPosStart = currentPos[directionDim];
		for (const cOnLine of groupCandidates) {
			const pathPosEnd = cOnLine.position[directionDim];
			for (const path of pathPrices) {
				// pathStart < pathEnd due to sorting in constructor
				const pathStart = path[0];
				const pathEnd = path[1];
				pathPrice += Math.max(
					0,
					forwards
						? Math.min(pathPosEnd, pathEnd) - Math.max(pathPosStart, pathStart)
						: Math.min(pathPosStart, pathEnd) - Math.max(pathPosEnd, pathStart)
				);
			}
			pathPosStart = pathPosEnd;
			this.addCandidate(
				currentPos,
				cOnLine.position,
				candidate.keyFrom,
				price +
					getMnhDist(currentPos, cOnLine.position) +
					pathPrice * OVERLAP_PRICE_FACTOR +
					cornerPrice,
				true
			);
		}
	}

	constructPath(currentPos: Point) {
		const path = [this.endPos];
		let current = currentPos;
		while (current[0] !== this.startPos[0] || current[1] !== this.startPos[1]) {
			current = this.positionsVisited[this.getPointKey(current)].from;
			path.unshift(current);
		}
		return path;
	}

	getPointKey(point: Point) {
		return point[0] + point[1] * 1000000;
		//		return `${point[0]},${point[1]}`;
	}

	findCandidatesOnLine(from: Point, to: Point, skipOvershoot = false) {
		const candidates = [to];
		const horizontal = from[1] === to[1];
		const directionDim = horizontal ? 0 : 1;
		const dist =
			Math.abs(to[directionDim] - from[directionDim]) +
			(skipOvershoot ? 0 : CANDIDATS_ON_LINE_OVERSHOOT);
		const dir = Math.sign(to[directionDim] - from[directionDim]);

		for (const node of this.nodes) {
			const [left, up, right, down] = node.area;

			const distToNode = horizontal
				? Math.min(Math.abs(from[1] - up), Math.abs(from[1] - down))
				: Math.min(Math.abs(from[0] - left), Math.abs(from[0] - right));
			if (distToNode > MAX_DIST_NODE) {
				continue;
			}
			const points = horizontal
				? [
						[Math.floor(left / GRID_SIZE) * GRID_SIZE, from[1]],
						[Math.ceil(right / GRID_SIZE) * GRID_SIZE, from[1]],
				  ]
				: [
						[from[0], Math.floor(up / GRID_SIZE) * GRID_SIZE],
						[from[0], Math.ceil(down / GRID_SIZE) * GRID_SIZE],
				  ];
			for (const p of points) {
				const distP = Math.abs(from[directionDim] - p[directionDim]);
				const dirP = Math.sign(p[directionDim] - from[directionDim]);

				if (dirP !== dir || distP > dist || distP === 0) {
					continue;
				}
				candidates.push([p[0], p[1]] as Point);
			}
		}

		const paths = horizontal ? this.pathsV : this.pathsH;
		for (const path of paths) {
			const pathPerpendicularDist =
				from[1 - directionDim] >= path[0][1 - directionDim] &&
				from[1 - directionDim] <= path[1][1 - directionDim]
					? 0
					: Math.min(
							Math.abs(path[0][1 - directionDim] - from[1 - directionDim]),
							Math.abs(path[1][1 - directionDim] - from[1 - directionDim])
					  );
			if (pathPerpendicularDist > MAX_DIST_PATH) {
				continue;
			}
			const points = horizontal
				? [
						[(Math.floor(path[0][0] / GRID_SIZE) - 1) * GRID_SIZE, from[1]],
						[(Math.ceil(path[1][0] / GRID_SIZE) + 1) * GRID_SIZE, from[1]],
				  ]
				: [
						[from[0], (Math.floor(path[0][1] / GRID_SIZE) - 1) * GRID_SIZE],
						[from[0], (Math.ceil(path[1][1] / GRID_SIZE) + 1) * GRID_SIZE],
				  ];
			for (const p of points) {
				const pathDist = Math.abs(from[directionDim] - p[directionDim]);
				const dirP = Math.sign(p[directionDim] - from[directionDim]);
				if (dirP !== dir || pathDist > dist || pathDist === 0) {
					continue;
				}
				candidates.push(p as Point);
			}
		}

		return candidates;
	}

	testPath(from: Point, to: Point) {
		console.log("test");
		const horizontal = from[1] === to[1];
		const directionDim = horizontal ? 0 : 1;

		const { clipped } = findClippedNode(from, to, this.nodes);
		if (clipped) {
			const blockingArea = [...clipped.node.area];
			// flatten blocking area to a line to make further proccessing easier
			if (
				Math.abs(from[directionDim] - blockingArea[LEFT + directionDim]) >
				Math.abs(from[directionDim] - blockingArea[RIGHT + directionDim])
			) {
				blockingArea[LEFT + directionDim] = blockingArea[RIGHT + directionDim];
			} else {
				blockingArea[RIGHT + directionDim] = blockingArea[LEFT + directionDim];
			}
			return blockingArea;
		}

		return null;
	}

	getPathPrice(from: Point, to: Point) {
		const horizontal = from[1] === to[1];
		const directionDim = horizontal ? 0 : 1;
		const paths = horizontal ? this.pathsH : this.pathsV;

		const pathStart =
			from[directionDim] < to[directionDim]
				? from[directionDim]
				: to[directionDim];
		const pathEnd =
			from[directionDim] < to[directionDim]
				? to[directionDim]
				: from[directionDim];
		const pathPosition = from[1 - directionDim];

		const blockedSections = [] as Point[];

		for (const otherPath of paths) {
			if (
				pathPosition > otherPath[0][1 - directionDim] + GRID_SIZE / 2 ||
				pathPosition < otherPath[0][1 - directionDim] - GRID_SIZE / 2
			) {
				continue;
			}
			const otherPathStart = otherPath[0][directionDim];
			const otherPathEnd = otherPath[1][directionDim];
			if (pathStart <= otherPathEnd && pathEnd >= otherPathStart) {
				blockedSections.push([
					Math.max(pathStart, otherPathStart),
					Math.min(pathEnd, otherPathEnd),
				] as Point);
			}
		}
		return blockedSections;
	}
}

export const drawDebug = (ctx: CanvasRenderingContext2D) => {
	if (!candidatPosToDraw.length) {
		return;
	}
	console.log("search", candidatPosToDraw.length);

	ctx.strokeStyle = "#ff00ff";
	ctx.lineWidth = 2;

	for (const candidate of candidatPosToDraw) {
		ctx.beginPath();
		ctx.rect(candidate[0] - 7, candidate[1] - 7, 14, 14);
		ctx.stroke();
	}
	ctx.strokeStyle = "#00ff00";
	ctx.beginPath();
	ctx.rect(candidatPosToDraw[0][0] - 7, candidatPosToDraw[0][1] - 7, 14, 14);
	ctx.stroke();
	ctx.strokeStyle = "#ff0000";
	ctx.beginPath();
	ctx.rect(
		candidatPosToDraw[candidatPosToDraw.length - 1][0] - 7,
		candidatPosToDraw[candidatPosToDraw.length - 1][1] - 7,
		14,
		14
	);
	ctx.stroke();
	candidatPosToDraw = [];
};

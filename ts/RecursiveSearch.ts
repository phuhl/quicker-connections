import { liangBarsky } from "./liangBarsky.js";
import {
	BoundingBox,
	DOWN,
	LEFT,
	Node,
	Point,
	Pos,
	RIGHT,
	UP,
} from "./utils/types.js";

export const GRID_SIZE = 5;
const WRONG_DIR_MAX_DIST = GRID_SIZE * 60;
const ABORT_DIST = GRID_SIZE * 200;
const CANDIDATS_ON_LINE_OVERSHOOT = GRID_SIZE * 20;
const MAX_DIST_NODE = GRID_SIZE * 20;
const MAX_ITERATIONS = 120;

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
	positionFrom: Point;
	positionParent?: Point;
	position: Point;
	fullyVisited: boolean;
	group?: string;
	price: number;
	targetEstimate: number;
	gridX: number;
	gridY: number;
};

let candidatPosToDraw = [] as Point[];

export class RecursiveSearch {
	gridSpaceUsed = [] as boolean[][];

	positionsVisited = {} as Record<number, Point>;

	candidates = [] as Candidate[];
	targetFoundPrice = Number.MAX_SAFE_INTEGER;

	constructor(
		private startPos: Point,
		private endPos: Point,
		private nodes: Node[],
		private ctx: CanvasRenderingContext2D | null = null
	) {}

	public run(): Point[] | null {
		return this.search(this.startPos);
	}

	private search(currentPos: Point): Point[] | null {
		this.candidates.push({
			gridX: Math.floor(currentPos[0] / GRID_SIZE),
			gridY: Math.floor(currentPos[1] / GRID_SIZE),
			key: this.getPointKey(currentPos),
			position: currentPos,
			fullyVisited: true,
			positionFrom: currentPos,
			price: 0,
			targetEstimate: getMnhDist(currentPos, this.endPos),
		});
		this.positionsVisited[this.getPointKey(currentPos)] = currentPos;

		let pathFound = false as false | Point[];

		let candidatesChecked = 0;
		while (this.candidates.length > 0 && candidatesChecked++ < MAX_ITERATIONS) {
			const candidate = this.getBestCandidate();
			this.removedCandidates.push(candidate);
			pathFound = this.findCandidates(candidate) || pathFound;

			if (pathFound) {
				//				return pathFound;
				filterInPlace(
					this.candidates,
					(p) => p.price + p.targetEstimate < this.targetFoundPrice
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
	getBestCandidate() {
		let leastPrice = Number.MAX_SAFE_INTEGER,
			leastTargetEstimate = Number.MAX_SAFE_INTEGER,
			bestIndex = -1,
			currentIndex = 0;
		for (const candidate of this.candidates) {
			const price = candidate.price + candidate.targetEstimate;
			if (
				price === leastPrice &&
				candidate.targetEstimate < leastTargetEstimate
			) {
				leastTargetEstimate = candidate.targetEstimate;
				bestIndex = currentIndex;
			}
			if (price < leastPrice) {
				leastPrice = candidate.price + candidate.targetEstimate;
				leastTargetEstimate = candidate.targetEstimate;
				bestIndex = currentIndex;
			}
			currentIndex++;
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
			this.gridSpaceUsed[currentCandidate.gridX][currentCandidate.gridY] =
				false;

			this.checkCandidate(
				currentCandidate,
				currentCandidate.positionFrom,
				currentCandidate.position,
				currentCandidate.price
			);
			return false;
		}

		if (currentPos[0] === this.endPos[0] && currentPos[1] === this.endPos[1]) {
			this.targetFoundPrice = Math.min(
				this.targetFoundPrice,
				currentCandidate.price
			);
			if (currentCandidate.price === this.targetFoundPrice) {
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
			if (this.positionsVisited[parentKey]) {
				continue;
			}

			const candidates = this.findCandidatesOnLine(currentPos, parentCandidate);
			for (const candidate of candidates) {
				const key = this.getPointKey(candidate);
				if (this.positionsVisited[key]) {
					continue;
				}

				if (this.ctx) {
					this.ctx.strokeStyle = "#f0f000";
					this.ctx.beginPath();
					// rectangle around the candidate
					this.ctx.lineWidth = 2;
					this.ctx.rect(candidate[0] - 7, candidate[1] - 7, 14, 14);
					this.ctx.stroke();
				}

				const gridX = Math.floor(candidate[0] / GRID_SIZE);
				const gridY = Math.floor(candidate[1] / GRID_SIZE);
				if (
					this.gridSpaceUsed[gridX]?.[gridY] &&
					!(candidate[0] === this.endPos[0] && candidate[1] === this.endPos[1])
				) {
					continue;
				}

				this.gridSpaceUsed[gridX] = this.gridSpaceUsed[gridX] || [];
				this.gridSpaceUsed[gridX][gridY] = true;

				this.candidates.push({
					key,
					gridX,
					gridY,
					position: candidate,
					fullyVisited: false,
					group: currentCandidate.key + ";" + parentKey,
					positionParent: parentCandidate,
					positionFrom: currentPos,
					price: currentCandidate.price,
					targetEstimate:
						getMnhDist(currentPos, candidate) +
						getMnhDist(candidate, this.endPos),
				});
			}
		}

		return false;
	}

	addCandidate(currentPos: Point, candidate: Point, price: number) {
		const key = this.getPointKey(candidate);
		const gridX = Math.floor(candidate[0] / GRID_SIZE);
		const gridY = Math.floor(candidate[1] / GRID_SIZE);

		if (
			this.positionsVisited[key] ||
			(this.gridSpaceUsed[gridX]?.[gridY] &&
				!(
					candidate[0] === this.endPos[0] && candidate[1] === this.endPos[1]
				)) ||
			getMnhDist(this.endPos, candidate) > ABORT_DIST
		) {
			return false;
		}

		this.positionsVisited[key] = currentPos;
		this.gridSpaceUsed[gridX] = this.gridSpaceUsed[gridX] || [];
		this.gridSpaceUsed[gridX][gridY] = true;
		this.candidates.push({
			gridX,
			gridY,
			key,
			position: candidate,
			fullyVisited: true,
			positionFrom: currentPos,
			price: getMnhDist(currentPos, candidate) + price,
			targetEstimate: getMnhDist(candidate, this.endPos),
		});

		if (this.ctx) {
			this.ctx.strokeStyle = "#00ff00";
			this.ctx.beginPath();
			// rectangle around the candidate
			this.ctx.lineWidth = 2;
			this.ctx.rect(candidate[0] - 5, candidate[1] - 5, 10, 10);
			this.ctx.stroke();

			this.ctx.beginPath();

			this.ctx.lineWidth = 1;
			this.ctx.moveTo(currentPos[0], currentPos[1]);
			this.ctx.lineTo(candidate[0], candidate[1]);
			this.ctx.stroke();
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
		for (const removed of groupCandidates) {
			this.gridSpaceUsed[removed.gridX][removed.gridY] = false;
		}

		groupCandidates.push(candidate);

		const blockingNode = this.testPath([currentPos, furtherstInGroup]);
		const horizontal = currentPos[1] === candidatePos[1];
		let blockingNodePos: Point | null = null;
		if (blockingNode) {
			const area = blockingNode.node.linesArea;
			if (horizontal) {
				const leftIsCloser =
					Math.abs(currentPos[0] - area[LEFT]) <
					Math.abs(currentPos[0] - area[RIGHT]);

				blockingNodePos = leftIsCloser
					? [area[LEFT], currentPos[1]]
					: [area[RIGHT], currentPos[1]];
			} else {
				const downIsCloser =
					Math.abs(currentPos[1] - area[UP]) >
					Math.abs(currentPos[1] - area[DOWN]);
				blockingNodePos = downIsCloser
					? [currentPos[0], area[DOWN]]
					: [currentPos[0], area[UP]];
			}
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

		for (const cOnLine of groupCandidates) {
			this.addCandidate(currentPos, cOnLine.position, price);
		}
	}

	constructPath(currentPos: Point) {
		const path = [this.endPos];
		let current = currentPos;
		while (current[0] !== this.startPos[0] || current[1] !== this.startPos[1]) {
			current = this.positionsVisited[this.getPointKey(current)];
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
		const vertical = from[0] === to[0];
		const dist =
			(vertical ? Math.abs(from[1] - to[1]) : Math.abs(from[0] - to[0])) +
			(skipOvershoot ? 0 : CANDIDATS_ON_LINE_OVERSHOOT);
		const dir = vertical
			? Math.sign(to[1] - from[1])
			: Math.sign(to[0] - from[0]);
		// const blockedDimension = vertical ? to[1] : to[0];
		// const blockedRanges = [
		// 	[
		// 		blockedDimension - MIN_CANDIDATE_DISTANCE,
		// 		blockedDimension + MIN_CANDIDATE_DISTANCE,
		// 	],
		// ] as Point[];

		for (const node of this.nodes) {
			const [left, up, right, down] = node.linesArea;

			const distToNode = vertical
				? Math.min(Math.abs(from[0] - left), Math.abs(from[0] - right))
				: Math.min(Math.abs(from[1] - up), Math.abs(from[1] - down));
			if (distToNode > MAX_DIST_NODE) {
				continue;
			}
			const points = vertical
				? [
						[from[0], Math.floor(up / GRID_SIZE) * GRID_SIZE],
						[from[0], Math.ceil(down / GRID_SIZE) * GRID_SIZE],
				  ]
				: [
						[Math.floor(left / GRID_SIZE) * GRID_SIZE, from[1]],
						[Math.ceil(right / GRID_SIZE) * GRID_SIZE, from[1]],
				  ];
			for (const p of points) {
				const distP = vertical
					? Math.abs(from[1] - p[1])
					: Math.abs(from[0] - p[0]);
				const dirP = vertical
					? Math.sign(p[1] - from[1])
					: Math.sign(p[0] - from[0]);

				//				const blockedDimension = vertical ? p[1] : p[0];
				if (
					dirP !== dir ||
					distP > dist ||
					distP === 0 // ||
					// blockedRanges.some(
					// 	(range) =>
					// 		blockedDimension >= range[0] && blockedDimension <= range[1]
					// )
				) {
					continue;
				}
				// blockedRanges.push([
				// 	blockedDimension - MIN_CANDIDATE_DISTANCE,
				// 	blockedDimension + MIN_CANDIDATE_DISTANCE,
				// ]);
				candidates.push([p[0], p[1]] as Point);
			}
		}
		return candidates;
	}

	testPath(path: Point[]) {
		//		console.log("test");
		const len1 = path.length - 1;
		for (let p = 0; p < len1; ++p) {
			const { clipped } = this.findClippedNode(path[p], path[p + 1]);
			if (clipped) {
				return clipped;
			}
		}
		return null;
	}

	findClippedNode(outputXY: Point, inputXY: Point) {
		let closestDistance = Number.MAX_SAFE_INTEGER;
		let closest = null as null | { start: Point; end: Point; node: Node };

		for (let i = 0; i < this.nodes.length; ++i) {
			const node = this.nodes[i];
			const clipA = [-1, -1] as Point; // outputXY.slice();
			const clipB = [-1, -1] as Point; // inputXY.slice();
			//			const area = node.linesArea;
			// const area = node.linesArea.map((v, i) => (i > UP ? v - 1 : v + 1));
			const area = [
				node.linesArea[LEFT] + 1,
				node.linesArea[UP] + 1,
				node.linesArea[RIGHT] - 1,
				node.linesArea[DOWN] - 1,
			];

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

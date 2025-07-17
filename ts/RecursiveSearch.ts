import { LEFT, Node, Point, RIGHT, UP } from "./utils/types.js";
import { findClippedNode } from "./utils/findClippedNode.js";

export const GRID_SIZE = 5;
const WRONG_DIR_MAX_DIST = GRID_SIZE * 60;
const CANDIDATS_ON_LINE_OVERSHOOT = GRID_SIZE * 20;
const MAX_DIST_NODE = GRID_SIZE * 20;
const MAX_DIST_PATH = GRID_SIZE * 20;
const MAX_ITERATIONS = 800;
const CORNER_PRICE = 10;
const OVERLAP_PRICE_FACTOR = 50;

const getMnhDist = (a: Point, b: Point) => {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
};

const sortByClosest = (
	points: Point[],
	target: Point,
	dirDimension: number
) => {
	return points.sort((a, b) => {
		const distA = Math.abs(a[dirDimension] - target[dirDimension]);
		const distB = Math.abs(b[dirDimension] - target[dirDimension]);
		return distA - distB;
	});
};

const filterInPlace = <T>(list: T[], filter: (t: T, i: number) => boolean) => {
	let i: number, j: number;

	for (i = 0, j = 0; i < list.length; ++i) {
		if (filter(list[i], i)) {
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
	position: Point;
	positionFrom: Point;
	positionParent?: Point;
	fullyVisited: boolean;
	group?: string;
	targetEstimate: number;
	gridX: number;
	gridY: number;
};

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
	precheckedCandidates = {} as Record<
		string,
		{
			"0"?: {
				// horizontal
				"-1"?: Point; // left
				"+1"?: Point; // right
			};
			"1"?: {
				// vertical
				"-1"?: Point; // up
				"+1"?: Point; // down
			};
		}
	>;
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
		//		console.log("search");
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
		this.addCandidate(fakeFirstPos, currentPos, 0, true);

		let pathFound = false as false | Point[];

		while (
			this.candidates.length > 0 &&
			this.candidatesChecked++ < MAX_ITERATIONS
		) {
			const candidate = this.getBestCandidate();
			pathFound = this.findCandidates(candidate) || pathFound;

			if (pathFound) {
				const removed = filterInPlaceReturnFiltered(
					this.candidates,
					(p) =>
						this.positionsVisited[p.keyPrice].price + p.targetEstimate <
						this.targetFoundPrice
				);
				this.removedCandidates.push(...removed);
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
		console.log(
			"iterations",
			this.candidatesChecked,
			", open candidats",
			this.candidates.length,
			", removed candidats",
			this.removedCandidates.length
		);
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
			const dirDimension = currentPos[0] === parentCandidate[0] ? 1 : 0;
			const dir =
				currentPos[dirDimension] < parentCandidate[dirDimension] ? 1 : -1;

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

			const closestCandidates = this.findCandidatesOnLine(
				currentPos,
				parentCandidate
			);
			for (let i = 0; i < closestCandidates.length; i++) {
				const candidate = closestCandidates[i];
				if (i === 0) {
					this.addCandidate(
						currentPos,
						candidate,
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
								this.getTargetEstimate(candidate, currentCandidate.position),
						}
					);
				} else {
					this.addPreCheckedCandidate(
						closestCandidates[i - 1],
						closestCandidates[i],
						dirDimension,
						dir
					);
				}
			}
		}

		return false;
	}

	getTargetEstimate(candidatePos: Point, from: Point) {
		const positionFrom = from; // this.positionsVisited[fromKey].from;
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
		price: number,
		fullyVisited: boolean,
		candidateVals: Partial<Candidate> = {}
	) {
		const key = this.getPointKey(candidate);
		const fromKey = this.getPointKey(currentPos);
		const gridX = Math.floor(candidate[0] / GRID_SIZE);
		const gridY = Math.floor(candidate[1] / GRID_SIZE);

		if (this.positionsVisited[key]) {
			if (fullyVisited && this.positionsVisited[key].price > price) {
				this.positionsVisited[key] = {
					from: currentPos,
					fromKey,
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
				fromKey,
				price,
			};
			this.gridSpaceUsed[gridX] = this.gridSpaceUsed[gridX] || [];
			this.gridSpaceUsed[gridX][gridY] = true;
		}
		if (candidate[0] === this.endPos[0] && candidate[1] === this.endPos[1]) {
			console.log("here");
		}

		const targetEstimate = this.getTargetEstimate(candidate, currentPos);
		const candidateObj = {
			gridX,
			gridY,
			key,
			keyPrice: key,
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
			if (fullyVisited) {
				this.ctx.strokeStyle = "#ff0000";
				this.ctx.lineWidth = 2;
				drawCross(this.ctx, candidate[0], candidate[1]);
				if (currentlyCheaper) {
					this.ctx.fillStyle = "#00ff00";
					this.ctx.fillRect(candidate[0] - 7, candidate[1] - 7, 14, 14);
				}
				this.ctx.lineWidth = 1;
				drawLine(this.ctx, currentPos, candidate, 1);
				writeText(
					this.ctx,
					`${price + targetEstimate}`,
					candidate[0] + (isTarget ? -20 : 5),
					candidate[1],
					"#ff0000"
				);
				// writeText(
				// 	this.ctx,
				// 	`${this.getTargetEstimateCorner(candidate, currentPos)}`,
				// 	candidate[0] + (isTarget ? -20 : 5),
				// 	candidate[1] + 14,
				// 	"#ff5500"
				// );
				writeText(
					this.ctx,
					`${this.candidatesChecked}`,
					candidate[0] + (isTarget ? -30 : -15),
					candidate[1],
					"#ff00ff"
				);
			} else {
				this.ctx.strokeStyle = "#f0f000";
				this.ctx.lineWidth = 2;
				drawCross(this.ctx, candidate[0], candidate[1]);
				this.ctx.lineWidth = 1;
				drawLine(this.ctx, currentPos, candidate, -1);
				writeText(
					this.ctx,
					`${price + candidateObj.targetEstimate}`,
					candidate[0] + (isTarget ? -20 : 5),
					candidate[1] + 10,
					"#ff0000"
				);
				// writeText(
				// 	this.ctx,
				// 	`${this.candidatesChecked}`,
				// 	candidate[0] + (isTarget ? -40 : -15),
				// 	candidate[1] + 10,
				// 	"#ff00ff"
				// );
			}
		}

		return true;
	}

	addPreCheckedCandidate(
		previousPos: Point,
		candidate: Point,
		dirDimension: 0 | 1,
		dir: number
	) {
		const pointKey = this.getPointKey(previousPos);
		if (this.precheckedCandidates[pointKey]?.[dirDimension]?.[dir]) {
			throw new Error("Prechecked candidate already exists");
		}
		this.precheckedCandidates[pointKey] = {
			...this.precheckedCandidates[pointKey],
			[dirDimension]: {
				...this.precheckedCandidates[pointKey]?.[dirDimension],
				[dir]: candidate,
			},
		};
		if (this.ctx) {
			this.ctx.strokeStyle = "#f0f0f0";
			this.ctx.lineWidth = 1;
			drawCross(this.ctx, candidate[0], candidate[1]);
			this.ctx.lineWidth = 1;
			drawLine(this.ctx, previousPos, candidate, 0);
		}
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
		if (groupCandidates.length !== 1) {
			console.log("Group candidates", groupCandidates.length);
		}

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
				price +
					getMnhDist(currentPos, cOnLine.position) +
					pathPrice * OVERLAP_PRICE_FACTOR +
					cornerPrice,
				true
			);
		}
	}

	findCandidatesOnLine(from: Point, to: Point, skipOvershoot = false) {
		const candidates = [to];
		const horizontal = from[1] === to[1];
		const directionDim = horizontal ? 0 : 1;
		const dir = Math.sign(to[directionDim] - from[directionDim]);

		if (
			this.precheckedCandidates[this.getPointKey(from)]?.[directionDim]?.[dir]
		) {
			return [
				this.precheckedCandidates[this.getPointKey(from)]?.[directionDim]?.[
					dir
				],
			];
		}
		const dist =
			Math.abs(to[directionDim] - from[directionDim]) +
			(skipOvershoot ? 0 : CANDIDATS_ON_LINE_OVERSHOOT);

		this.findCandidatesByNodes(
			candidates,
			from,
			horizontal,
			directionDim,
			dir,
			dist
		);
		this.findCandidatesByPathCrossings(
			candidates,
			from,
			horizontal,
			directionDim,
			dir,
			dist
		);
		sortByClosest(candidates, from, directionDim);
		let lastX = null as null | number,
			lastY = null as null | number;
		filterInPlace(candidates, (c) => {
			if (c[0] === lastX || c[1] === lastY) {
				return false;
			}
			lastX = c[0];
			lastY = c[1];
			return true;
		});

		return candidates;
	}

	findCandidatesByNodes(
		candidates: Point[],
		from: Point,
		horizontal: boolean,
		directionDim: 0 | 1,
		dir: number,
		dist: number
	) {
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
	}

	pathsCrossingsHAt: Record<number, Point[][]> = {};
	pathsCrossingsVAt: Record<number, Point[][]> = {};
	findCandidatesByPathCrossings(
		candidates: Point[],
		from: Point,
		horizontal: boolean,
		directionDim: 0 | 1,
		dir: number,
		dist: number
	) {
		const directionDimOpposite = 1 - directionDim;
		const pos = from[directionDimOpposite];
		const cachedPathList = horizontal
			? this.pathsCrossingsVAt
			: this.pathsCrossingsHAt;
		const cachedPathListFound = Boolean(cachedPathList[pos]);
		const paths = cachedPathListFound
			? cachedPathList[pos]
			: horizontal
			? this.pathsV
			: this.pathsH;

		if (!cachedPathListFound) {
			cachedPathList[pos] = [];
		}

		for (const path of paths) {
			if (!cachedPathListFound) {
				const pathPerpendicularDist =
					from[directionDimOpposite] >= path[0][directionDimOpposite] &&
					from[directionDimOpposite] <= path[1][directionDimOpposite]
						? 0
						: Math.min(
								Math.abs(
									path[0][directionDimOpposite] - from[directionDimOpposite]
								),
								Math.abs(
									path[1][directionDimOpposite] - from[directionDimOpposite]
								)
						  );
				if (pathPerpendicularDist > MAX_DIST_PATH) {
					continue;
				}
				cachedPathList[pos].push(path);
			}

			const p1 = horizontal
				? [(Math.floor(path[0][0] / GRID_SIZE) - 1) * GRID_SIZE, from[1]]
				: [from[0], (Math.floor(path[0][1] / GRID_SIZE) - 1) * GRID_SIZE];
			const p2 = horizontal
				? [(Math.ceil(path[1][0] / GRID_SIZE) + 1) * GRID_SIZE, from[1]]
				: [from[0], (Math.ceil(path[1][1] / GRID_SIZE) + 1) * GRID_SIZE];
			let pathDist = Math.abs(from[directionDim] - p1[directionDim]);
			let dirP = Math.sign(p1[directionDim] - from[directionDim]);
			if (dirP === dir && pathDist <= dist && pathDist !== 0) {
				candidates.push(p1 as Point);
			}
			pathDist = Math.abs(from[directionDim] - p2[directionDim]);
			dirP = Math.sign(p2[directionDim] - from[directionDim]);
			if (dirP === dir && pathDist <= dist && pathDist !== 0) {
				candidates.push(p2 as Point);
			}
		}
	}

	testPath(from: Point, to: Point) {
		//		console.log("test");
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

	pathsOverlapsHAt: Record<number, Point[][]> = {};
	pathsOverlapsVAt: Record<number, Point[][]> = {};

	getPathPrice(from: Point, to: Point) {
		const horizontal = from[1] === to[1];
		const directionDim = horizontal ? 0 : 1;

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

		const cachedPathList = horizontal
			? this.pathsOverlapsHAt
			: this.pathsOverlapsVAt;
		const cachedPathListFound = Boolean(cachedPathList[pathPosition]);
		if (!cachedPathListFound) {
			cachedPathList[pathPosition] = [];
		}
		const paths = cachedPathListFound
			? cachedPathList[pathPosition]
			: horizontal
			? this.pathsH
			: this.pathsV;
		for (const otherPath of paths) {
			if (!cachedPathListFound) {
				if (
					pathPosition > otherPath[0][1 - directionDim] + GRID_SIZE / 2 ||
					pathPosition < otherPath[0][1 - directionDim] - GRID_SIZE / 2
				) {
					continue;
				} else {
					cachedPathList[pathPosition].push(otherPath);
				}
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

	getPointKey(point: Point) {
		if (this.ctx) {
			return `${point[0]},${point[1]}` as unknown as number;
		}
		return point[0] + point[1] * 1000000;
	}

	constructPath(currentPos: Point) {
		const path = [this.endPos];
		let current = currentPos;
		while (current[0] !== this.startPos[0] || current[1] !== this.startPos[1]) {
			current = this.positionsVisited[this.getPointKey(current)].from;
			path.unshift(current);
		}

		// remove points that don't do anything (i.e. are in a straight line)
		let j = 1;
		for (let i = 1; i < path.length - 1; ++i) {
			if (
				!(
					(path[i][0] === path[i - 1][0] && path[i][0] === path[i + 1][0]) ||
					(path[i][1] === path[i - 1][1] && path[i][1] === path[i + 1][1])
				)
			) {
				path[j++] = path[i];
			}
		}
		path[j++] = path[path.length - 1];

		while (j < path.length) {
			path.pop();
		}

		return path;
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

const writeText = (
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	color: string
) => {
	ctx.font = `6px Verdana`;
	ctx.strokeStyle = "white";
	ctx.lineWidth = 1;
	ctx.strokeText(text, x, y);
	ctx.fillStyle = color;
	ctx.fillText(text, x, y);
};

const drawCross = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
	ctx.beginPath();
	ctx.moveTo(x - 5, y);
	ctx.lineTo(x + 5, y);
	ctx.moveTo(x, y - 5);
	ctx.lineTo(x, y + 5);
	ctx.stroke();
};

const drawSquare = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
	ctx.beginPath();
	ctx.rect(x - 5, y - 5, 10, 10);
	ctx.stroke();
};

const drawLine = (
	ctx: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	offset: number
) => {
	ctx.beginPath();
	ctx.moveTo(from[0] - offset, from[1] - offset);
	ctx.lineTo(to[0] - offset, to[1] - offset);

	ctx.stroke();
};

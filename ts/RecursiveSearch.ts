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

const getDst = (a: number, b: number) => {
	return Math.abs(a[0] - b[0]);
};

const getMnhDist = (a: Point, b: Point) => {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
};

const getPathMnhDist = (path: Point[]) => {
	let dist = 0;
	for (let i = 0; i < path.length - 1; ++i) {
		dist += getMnhDist(path[i], path[i + 1]);
	}
	return dist;
};

const WRONG_DIR_MAX_DIST = 1000;
const ABORT_DIST = 1000;

type Candidate = {
	positionFrom: Point;
	fullyVisited: boolean;
	position: Point;
	price: number;
	targetEstimate: number;
};

export class RecursiveSearch {
	positionsVisited = {} as Record<string, Point>;

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
		console.log("search");

		this.candidates.push({
			position: currentPos,
			fullyVisited: true,
			positionFrom: currentPos,
			price: 0,
			targetEstimate: getMnhDist(currentPos, this.endPos),
		});

		let pathFound = false as false | Point[];

		while (this.candidates.length > 0) {
			const candidate = this.candidates.shift()!;
			pathFound = this.findCandidates(candidate, candidate.price);

			if (pathFound) {
				//				return pathFound;
				this.candidates = this.candidates.filter(
					(p) => p.price + p.targetEstimate < this.targetFoundPrice
				);
			}
			this.candidates.sort((a, b) => a.targetEstimate - b.targetEstimate);
			this.candidates.sort(
				(a, b) => a.price + a.targetEstimate - (b.price + b.targetEstimate)
			);
		}
		return pathFound || null;
	}

	findCandidates(currentCandidate: Candidate, price: number) {
		if (!currentCandidate.fullyVisited) {
			// calculate actual candidats from potential candidat
			this.checkCandidate(
				currentCandidate.positionFrom,
				currentCandidate.position,
				price
			);
			return false;
		}

		const currentPos = currentCandidate.position;

		if (currentPos[0] === this.endPos[0] && currentPos[1] === this.endPos[1]) {
			this.targetFoundPrice = currentCandidate.price;
			return this.constructPath(currentPos);
		}

		const dirX = Math.sign(this.endPos[0] - currentPos[0]);
		const dirY = Math.sign(this.endPos[1] - currentPos[1]);

		const candidates = [
			[currentPos[0], this.endPos[1]],
			[this.endPos[0], currentPos[1]],
			[currentPos[0], currentPos[1] - WRONG_DIR_MAX_DIST * dirY],
			[currentPos[0] - WRONG_DIR_MAX_DIST * dirX, currentPos[1]],
		] as Point[];

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

			this.candidates.push({
				position: candidate,
				fullyVisited: false,
				positionFrom: currentPos,
				price: getMnhDist(currentPos, candidate) + price,
				targetEstimate: getMnhDist(candidate, this.endPos),
			});
		}

		return false;
	}

	addCandidate(currentPos: Point, candidate: Point, price: number) {
		const key = this.getPointKey(candidate);

		if (
			this.positionsVisited[key] ||
			getMnhDist(this.endPos, candidate) > ABORT_DIST
		) {
			return false;
		}

		this.positionsVisited[key] = currentPos;

		this.candidates.push({
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

	checkCandidate(currentPos: Point, candidate: Point, price: number) {
		const blockingNode = this.testPath([currentPos, candidate as Point]);
		const horizontal = currentPos[1] === candidate[1];
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
		}

		for (const cOnLine of this.findCandidatesOnLine(
			currentPos,
			blockingNodePos ? blockingNodePos : candidate
		)) {
			this.addCandidate(currentPos, cOnLine, price);
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
		return `${point[0]},${point[1]}`;
	}

	findCandidatesOnLine(from: Point, to: Point) {
		const candidates = [to];
		const vertical = from[0] === to[0];
		const dist = vertical
			? Math.abs(from[1] - to[1])
			: Math.abs(from[0] - to[0]);
		const dir = vertical
			? Math.sign(from[1] - to[1])
			: Math.sign(from[0] - to[0]);

		for (const node of this.nodes) {
			const [left, up, right, down] = node.linesArea;
			const points = vertical
				? [
						[from[0], up],
						[from[0], down],
				  ]
				: [
						[left, from[1]],
						[right, from[1]],
				  ];
			for (const p of points) {
				const distP = vertical
					? Math.abs(from[1] - p[1])
					: Math.abs(from[0] - p[0]);
				const dirP = vertical
					? Math.sign(from[1] - p[1])
					: Math.sign(from[0] - p[0]);

				if (dirP !== dir || distP > dist || distP === 0) {
					continue;
				}
				candidates.push([p[0], p[1]] as Point);
			}
		}
		return candidates;
	}

	testPath(path: Point[]) {
		console.log("test");
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
}

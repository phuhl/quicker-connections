import { liangBarsky } from "./liangBarsky.js";
import { BoundingBox, Node, Point, Pos } from "./types.js";

export const findClippedNode = (
	outputXY: Point,
	inputXY: Point,
	nodes: Node[]
) => {
	let closestDistance = Number.MAX_SAFE_INTEGER;
	let closest = null as null | { start: Point; end: Point; node: Node };

	for (let i = 0; i < nodes.length; ++i) {
		const node = nodes[i];
		const clipA = [-1, -1] as Point; // outputXY.slice();
		const clipB = [-1, -1] as Point; // inputXY.slice();
		const area = node.linesArea;

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
};

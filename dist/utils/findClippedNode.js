import { Pos, LEFT, UP, RIGHT, DOWN, } from "./types.js";
import { liangBarsky } from "./liangBarsky.js";
export const findClippedNode = (outputXY, inputXY, nodes) => {
    let closestDistance = Number.MAX_SAFE_INTEGER;
    let closest = null;
    for (let i = 0; i < nodes.length; ++i) {
        const node = nodes[i];
        const clipA = [-1, -1]; // outputXY.slice();
        const clipB = [-1, -1]; // inputXY.slice();
        const area = [
            node.linesArea[LEFT] + 1,
            node.linesArea[UP] + 1,
            node.linesArea[RIGHT] - 1,
            node.linesArea[DOWN] - 1,
        ];
        const clipped = liangBarsky({
            a: outputXY,
            b: inputXY,
            box: area,
            da: clipA,
            db: clipB,
        });
        if (clipped === Pos.INSIDE) {
            const centerX = area[0] + (area[2] - area[0]) / 2;
            const centerY = area[1] + (area[3] - area[1]) / 2;
            const dist = Math.sqrt((centerX - outputXY[0]) ** 2 + (centerY - outputXY[1]) ** 2);
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

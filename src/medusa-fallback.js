import { Matrix4, Vector3 } from "three";

export function createMedusaFallback(canvas) {
  const ctx = canvas.getContext("2d");
  const matrix = new Matrix4();
  const point = new Vector3();

  return {
    draw({ width, height, camera, body, sleeves, state, wake, time }) {
      if (!ctx) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      body.updateWorldMatrix(true, false);
      const project = (x, y, z, transform = body.matrixWorld) => {
        point.set(x, y, z).applyMatrix4(transform).project(camera);
        return [(point.x + 1) * width / 2, (1 - point.y) * height / 2];
      };

      const [x, y] = project(0, 0, 0);
      const radius = Math.max(12, Math.abs(project(0, 1.34, 0)[1] - y));
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#b8d9d7";
      for (const scale of [1.8, 2.5, 3.2]) {
        ctx.beginPath();
        ctx.ellipse(x, y, radius * scale, radius * scale * .55, -.25 + time * .02, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.lineCap = "round";
      for (let index = 0; index < sleeves.count; index++) {
        sleeves.getMatrixAt(index, matrix);
        matrix.premultiply(body.matrixWorld);
        const start = project(0, -.29, 0, matrix);
        const end = project(0, .29, 0, matrix);
        const size = Math.max(1, Math.hypot(end[0] - start[0], end[1] - start[1]));
        ctx.beginPath();
        ctx.moveTo(...start);
        ctx.lineTo(...end);
        ctx.lineWidth = size * 1.25;
        ctx.strokeStyle = index % 5 === 2 ? "#ff5a3c" : "#638c8b";
        ctx.stroke();
        ctx.lineWidth = size * .83;
        ctx.strokeStyle = index % 4 === 0 ? "#9de0d8" : "#f6fcfb";
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(state.roll);
      const dome = ctx.createLinearGradient(0, -radius, 0, 0);
      dome.addColorStop(0, "#f7ffff");
      dome.addColorStop(1, "#8ecac5");
      ctx.fillStyle = dome;
      ctx.strokeStyle = "#0e3a3d";
      ctx.lineWidth = 2;
      const open = 1 + state.petal * .5 + state.expl * .5;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * open, radius * (1.1 - state.pulse * .12), 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * radius * .64 * open, 0);
        ctx.quadraticCurveTo(side * radius * .42 * open, -radius * .84, 0, -radius);
        ctx.stroke();
      }
      ctx.fillStyle = "#0e3a3d";
      ctx.fillRect(-radius, 0, radius * 2, radius * .14);
      ctx.fillStyle = "#46c9bf";
      ctx.fillRect(-radius * .24, radius * .14, radius * .48, radius * (.1 + state.siphon * .35));
      ctx.fillStyle = "#ff5a3c";
      const opticX = radius * state.optic * .65;
      ctx.beginPath();
      ctx.arc(opticX, -radius * .45, radius * .27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0e3a3d";
      ctx.beginPath();
      ctx.arc(opticX, -radius * .45, radius * .18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#46c9bf";
      ctx.fillRect(-radius * .2, -radius * (1.08 + state.pump), radius * .4, radius * .1);

      if (wake) {
        ctx.fillStyle = "#65c5bc";
        for (let index = 0; index < 18; index++) {
          const phase = (time * 1.8 + index / 18) % 1;
          ctx.beginPath();
          ctx.arc(Math.sin(index * 2.4) * radius * phase * .5, radius * (.3 + phase * 2), 1.5 * (1 - phase), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  };
}
